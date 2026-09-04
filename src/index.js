/**
 * dsh-skill-hub — Host half
 *
 * Intercepts /api skill-hub/* RPC endpoints for the browser half.
 * All RPC endpoints use the Connection RPC intercept mechanism (POST /api/<endpoint>).
 *
 * Endpoints:
 *   skill-hub/search       — search skills across SkillHub + ClawHub
 *   skill-hub/detail       — get skill detail (README, versions, stats)
 *   skill-hub/installed    — list locally installed skills
 *   skill-hub/install      — download + install a skill to $DSH_HOME/skills/
 *   skill-hub/uninstall    — remove a locally installed skill
 *   skill-hub/readme       — read README.md / SKILL.md of an installed skill
 *   skill-hub/categories   — list skill categories from SkillHub
 *
 * Data sources:
 *   Primary: SkillHub (api.skillhub.tencent.com) — Tencent CN mirror, fast
 *   Fallback: ClawHub (clawhub.com) — official source
 */

import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join, resolve } from 'node:path'
import { Readable } from 'node:stream'
import { pipeline } from 'node:stream/promises'
import { createWriteStream } from 'node:fs'
import { tmpdir } from 'node:os'
import { randomUUID } from 'node:crypto'
import { unzipSync } from 'node:zlib'
import { execSync } from 'node:child_process'

// ── Config ──────────────────────────────────────────────────────────────

const DEFAULT_SKILLHUB_API = 'https://api.skillhub.tencent.com'
// clawhub.com 已 307 跳转到 clawhub.ai，直接用新域名少一跳
const DEFAULT_CLAWHUB_API = 'https://clawhub.ai'

// ── Helpers ─────────────────────────────────────────────────────────────

/**
 * Resolve the local skills directory.
 * Priority: config.localSkillsDir > $DSH_HOME/skills > ~/.dsh/skills
 */
function resolveSkillsDir(config) {
  if (config.localSkillsDir) return resolve(config.localSkillsDir)
  const dshHome = process.env.DSH_HOME || join(homedir(), '.dsh')
  return join(dshHome, 'skills')
}

/**
 * HTTP GET with JSON parse, timeout, and error containment.
 */
async function httpGetJson(url, { timeoutMs = 15000, headers = {} } = {}) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: { 'Accept': 'application/json', ...headers },
    })
    if (!res.ok) {
      const text = await res.text().catch(() => '')
      throw new Error(`HTTP ${res.status}: ${text.slice(0, 200)}`)
    }
    return await res.json()
  } finally {
    clearTimeout(timer)
  }
}

/**
 * HTTP GET binary (for ZIP download).
 */
async function httpGetBuffer(url, { timeoutMs = 60000, headers = {} } = {}) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: { 'Accept': 'application/zip,*/*', ...headers },
    })
    if (!res.ok) {
      const text = await res.text().catch(() => '')
      throw new Error(`HTTP ${res.status}: ${text.slice(0, 200)}`)
    }
    const buf = Buffer.from(await res.arrayBuffer())
    return buf
  } finally {
    clearTimeout(timer)
  }
}

/**
 * RPC result helpers.
 */
function ok(value) {
  return { ok: true, value }
}
/**
 * RPC error helper.
 * NOTE: The 'code' must be one of the values in the dsh RPC Zod schema enum:
 * 'bad-request' | 'cancelled' | 'internal' | 'command-error' | 'unknown-command' | etc.
 * We only use 'bad-request' (user error) and 'internal' (server error) for skill-hub.
 */
function err(code, message, details = {}) {
  // Map unknown codes to allowed ones
  const allowedCodes = new Set([
    'bad-request', 'cancelled', 'internal', 'command-error', 'unknown-command',
    'settings-rejected', 'credential-rejected',
  ])
  const finalCode = allowedCodes.has(code) ? code : 'internal'
  return { ok: false, error: { code: finalCode, message, details } }
}

// ── SkillHub API ────────────────────────────────────────────────────────

/**
 * Search SkillHub (api.skillhub.tencent.com).
 * GET /api/skills?page=1&pageSize=20&keyword=xxx&sortBy=downloads&order=desc
 */
async function searchSkillHub(apiBase, keyword, page = 1, pageSize = 20, category = '') {
  const params = new URLSearchParams()
  if (keyword) params.set('keyword', keyword)
  params.set('page', String(page))
  params.set('pageSize', String(pageSize))
  params.set('sortBy', 'downloads')
  params.set('order', 'desc')
  if (category) params.set('category', category)
  const url = `${apiBase}/api/skills?${params.toString()}`
  const data = await httpGetJson(url)
  // SkillHub returns { code: 0, data: { skills: [...], total: N } }
  const skills = data?.data?.skills ?? []
  const total = data?.data?.total ?? skills.length
  return {
    source: 'skillhub',
    items: skills.map(s => ({
      slug: s.slug ?? s.name ?? '',
      name: s.name ?? s.slug ?? '',
      displayName: s.displayName ?? s.name ?? '',
      summary: s.summary ?? s.description ?? '',
      summaryZh: s.summary_zh ?? s.description_zh ?? s.summaryZh ?? '',
      author: s.ownerName ?? s.author ?? s.namespace?.displayName ?? '',
      downloads: s.downloads ?? s.stats?.downloads ?? 0,
      installs: s.installs ?? s.stats?.installs ?? 0,
      stars: s.stars ?? s.stats?.stars ?? 0,
      iconUrl: s.iconUrl ?? '',
      verified: !!(s.verified ?? s.isAuthorVerified),
      homepage: s.homepage ?? s.upstream_url ?? '',
      version: s.version ?? '',
      tags: s.tags ?? s.subCategories ?? [],
      category: s.category ?? '',
      source: 'skillhub',
      installRef: s.slug ?? s.name ?? '',
    })),
    total,
    page,
    pageSize,
  }
}

/**
 * Get SkillHub skill detail (batch endpoint, no auth needed).
 * POST /api/v1/skills/batch with { slugs: [slug] }
 */
async function detailSkillHub(apiBase, slug) {
  // Try batch endpoint first (no auth needed)
  const url = `${apiBase}/api/v1/skills/batch`
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 15000)
  try {
    const res = await fetch(url, {
      method: 'POST',
      signal: controller.signal,
      headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
      body: JSON.stringify({ slugs: [slug] }),
    })
    clearTimeout(timer)
    if (!res.ok) {
      throw new Error(`HTTP ${res.status}`)
    }
    const data = await res.json()
    // Batch API returns {count, items: [{skill: {...}, owner: {...}, latestVersion: {...}, securityReports: {...}}]}
    const items = data?.items ?? data?.data?.skills ?? data?.data ?? []
    const item = Array.isArray(items) ? items[0] : items?.[slug]
    if (!item) return null
    // The actual skill data may be nested under item.skill or directly on item
    const skill = item.skill ?? item
    const owner = item.owner ?? {}
    const latestVersion = item.latestVersion ?? {}
    return {
      slug: skill.slug ?? slug,
      name: skill.name ?? skill.slug ?? slug,
      displayName: skill.displayName ?? skill.name ?? slug,
      summary: skill.summary ?? skill.description ?? '',
      summaryZh: skill.summary_zh ?? '',
      author: owner.handle ?? owner.displayName ?? skill.author ?? '',
      downloads: skill.downloads ?? skill.stats?.downloads ?? 0,
      installs: skill.installs ?? skill.stats?.installs ?? 0,
      // 详情接口的统计值嵌在 skill.stats 里（搜索接口是平铺字段）
      stars: skill.stars ?? skill.stats?.stars ?? 0,
      iconUrl: skill.iconUrl ?? '',
      verified: !!(skill.verified ?? skill.isAuthorVerified),
      version: latestVersion.version ?? skill.version ?? '',
      tags: skill.tags ?? skill.subCategories ?? [],
      category: skill.category ?? '',
      readme: skill.readme ?? '',
      securityReports: item.securityReports ?? skill.securityReports ?? [],
      source: 'skillhub',
    }
  } catch (e) {
    clearTimeout(timer)
    throw e
  }
}

/**
 * Read a SkillHub skill file content.
 * GET /api/v1/skills/{slug}/file?path=SKILL.md
 */
async function readFileSkillHub(apiBase, slug, filePath) {
  const params = new URLSearchParams({ path: filePath })
  const url = `${apiBase}/api/v1/skills/${encodeURIComponent(slug)}/file?${params.toString()}`
  // File API returns binary (application/octet-stream), not JSON
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 15000)
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: { 'Accept': '*/*' },
    })
    if (!res.ok) {
      throw new Error(`HTTP ${res.status}`)
    }
    return await res.text()
  } finally {
    clearTimeout(timer)
  }
}

/**
 * Download a SkillHub skill ZIP.
 * GET /api/v1/download?slug={slug}
 */
async function downloadSkillHub(apiBase, slug) {
  const url = `${apiBase}/api/v1/download?slug=${encodeURIComponent(slug)}`
  return httpGetBuffer(url)
}

// ── ClawHub API ──────────────────────────────────────────────────────────

/**
 * Search ClawHub (clawhub.com).
 * GET /api/v1/search?q={keyword}&limit={limit}
 */
async function searchClawHub(apiBase, keyword, limit = 20) {
  const params = new URLSearchParams({ q: keyword, limit: String(limit) })
  const url = `${apiBase}/api/v1/search?${params.toString()}`
  const data = await httpGetJson(url)
  const results = data?.results ?? []
  return {
    source: 'clawhub',
    items: results.map(r => {
      const ref = r.install?.reference ?? ''
      const [owner, slugPart] = ref.split('/')
      return {
        slug: r.slug ?? slugPart ?? r.name ?? '',
        name: r.name ?? r.slug ?? '',
        displayName: r.displayName ?? r.name ?? '',
        summary: r.summary ?? r.description ?? '',
        summaryZh: '',
        author: r.owner?.displayName ?? owner ?? r.author ?? '',
        downloads: r.downloads ?? 0,
        // ClawHub 没有 star，用收藏数（bookmarks）作为等价热度指标
        stars: r.metrics?.bookmarks ?? r.stars ?? 0,
        installs: r.metrics?.rolling60DayInstalls ?? r.installs ?? 0,
        iconUrl: r.icon ?? r.owner?.image ?? '',
        verified: !!(r.official ?? r.trust?.verified ?? r.publisher?.official),
        version: r.version ?? '',
        tags: r.tags ?? r.categories ?? [],
        category: r.category ?? '',
        source: 'clawhub',
        installRef: ref,
        ownerHandle: owner,
      }
    }),
    total: results.length,
    page: 1,
    pageSize: limit,
  }
}

/**
 * Get ClawHub skill detail.
 * GET /api/v1/skills/{slug}?ownerHandle={owner}
 */
async function detailClawHub(apiBase, slug, ownerHandle) {
  const params = new URLSearchParams()
  if (ownerHandle) params.set('ownerHandle', ownerHandle)
  const url = `${apiBase}/api/v1/skills/${encodeURIComponent(slug)}?${params.toString()}`
  const data = await httpGetJson(url)
  if (!data) return null
  return {
    slug: data.slug ?? slug,
    name: data.name ?? data.slug ?? slug,
    displayName: data.displayName ?? data.name ?? slug,
    summary: data.summary ?? data.description ?? '',
    summaryZh: '',
    author: data.owner?.displayName ?? data.author ?? ownerHandle ?? '',
    downloads: data.downloads ?? 0,
    stars: data.metrics?.bookmarks ?? data.stars ?? 0,
    installs: data.metrics?.rolling60DayInstalls ?? data.installs ?? 0,
    iconUrl: data.icon ?? data.owner?.image ?? '',
    verified: !!(data.official ?? data.verified),
    version: data.version ?? '',
    tags: data.tags ?? data.categories ?? [],
    category: data.category ?? '',
    readme: data.readme ?? '',
    securityReports: [],
    source: 'clawhub',
  }
}

/**
 * Download a ClawHub skill ZIP.
 * GET /api/v1/download?slug={slug}&ownerHandle={owner}
 */
async function downloadClawHub(apiBase, slug, ownerHandle) {
  const params = new URLSearchParams({ slug })
  if (ownerHandle) params.set('ownerHandle', ownerHandle)
  const url = `${apiBase}/api/v1/download?${params.toString()}`
  return httpGetBuffer(url)
}

// ── ZIP extraction (using system unzip or node:zlib) ────────────────────

/**
 * Extract a ZIP buffer to a target directory.
 * Uses system `tar` (available on Windows 10+ and all Unix) as the primary method.
 * Falls back to a manual ZIP parser for simple flat archives.
 */
function extractZip(zipBuffer, targetDir) {
  // Ensure target dir exists
  mkdirSync(targetDir, { recursive: true })

  // Write the zip to a temp file
  const tempZip = join(tmpdir(), `dsh-skill-${randomUUID()}.zip`)
  writeFileSync(tempZip, zipBuffer)

  try {
    // Try system tar (Windows 10+ has tar.exe, Unix always has tar)
    try {
      execSync(`tar -xf "${tempZip}" -C "${targetDir}"`, {
        timeout: 30000,
        stdio: 'pipe',
        windowsHide: true,
      })
      return targetDir
    } catch (tarErr) {
      // tar not available or failed, try PowerShell Expand-Archive (Windows)
      if (process.platform === 'win32') {
        try {
          execSync(
            `powershell -NoProfile -Command "Expand-Archive -Path '${tempZip}' -DestinationPath '${targetDir}' -Force"`,
            { timeout: 30000, stdio: 'pipe', windowsHide: true }
          )
          return targetDir
        } catch (psErr) {
          // Fall through to manual extraction
        }
      }
    }

    // Last resort: manual ZIP (store method only, no compression)
    // This handles the simple flat SKILL.md + _meta.json structure
    extractZipManual(zipBuffer, targetDir)
    return targetDir
  } finally {
    try { rmSync(tempZip, { force: true }) } catch {}
  }
}

/**
 * Manual ZIP extraction for simple archives (STORE method only).
 * Handles the common case of ClawHub/SkillHub flat skill packages.
 */
function extractZipManual(zipBuffer, targetDir) {
  // ZIP format: each file has a local file header
  let offset = 0
  while (offset < zipBuffer.length - 4) {
    // Look for local file header signature: PK\x03\x04 (0x04034b50)
    const sig = zipBuffer.readUInt32LE(offset)
    if (sig !== 0x04034b50) break

    const compressionMethod = zipBuffer.readUInt16LE(offset + 8)
    const compressedSize = zipBuffer.readUInt32LE(offset + 18)
    const uncompressedSize = zipBuffer.readUInt32LE(offset + 22)
    const filenameLen = zipBuffer.readUInt16LE(offset + 26)
    const extraFieldLen = zipBuffer.readUInt16LE(offset + 28)

    const filenameStart = offset + 30
    const filename = zipBuffer.slice(filenameStart, filenameStart + filenameLen).toString('utf8')

    const dataStart = filenameStart + filenameLen + extraFieldLen
    const dataSize = compressionMethod === 0 ? uncompressedSize : compressedSize
    const fileData = zipBuffer.slice(dataStart, dataStart + dataSize)

    // Skip directory entries
    if (filename.endsWith('/')) {
      offset = dataStart + dataSize
      continue
    }

    // Only handle STORE method (0); skip compressed entries
    if (compressionMethod === 0) {
      const safeName = filename.replace(/\.\.[\/\\]/g, '').replace(/[\\]/g, '/')
      const outPath = join(targetDir, safeName)
      const outDir = join(outPath, '..')
      mkdirSync(outDir, { recursive: true })
      writeFileSync(outPath, fileData)
    }

    // Move to next entry
    offset = dataStart + dataSize
  }
}

// ── Local skill management ──────────────────────────────────────────────

/**
 * List locally installed skills by scanning the skills directory.
 * Each subdirectory with a SKILL.md is considered an installed skill.
 */
function listLocalSkills(skillsDir) {
  if (!existsSync(skillsDir)) return []
  const entries = readdirSync(skillsDir, { withFileTypes: true })
  const skills = []
  for (const entry of entries) {
    if (!entry.isDirectory()) continue
    const skillDir = join(skillsDir, entry.name)
    const skillMdPath = join(skillDir, 'SKILL.md')
    if (!existsSync(skillMdPath)) continue
    // Parse frontmatter from SKILL.md
    const content = readFileSync(skillMdPath, 'utf8')
    const meta = parseFrontmatter(content)
    skills.push({
      name: meta.name ?? entry.name,
      dirName: entry.name,
      description: meta.description ?? '',
      whenToUse: meta.whenToUse ?? '',
      version: meta.metadata?.version ?? '',
      author: meta.metadata?.author ?? '',
      installed: true,
      dir: skillDir,
    })
  }
  return skills
}

/**
 * Parse YAML frontmatter from a Markdown file.
 */
function parseFrontmatter(text) {
  const result = {}
  if (!text.startsWith('---')) return result
  const end = text.indexOf('\n---', 3)
  if (end < 0) return result
  const fm = text.slice(3, end).trim()
  // Simple line-based parser
  let currentObj = result
  let currentIndent = 0
  for (const line of fm.split('\n')) {
    const indent = line.match(/^(\s*)/)[0].length
    const trimmed = line.trim()
    if (!trimmed) continue
    const colonIdx = trimmed.indexOf(':')
    if (colonIdx < 0) continue
    const key = trimmed.slice(0, colonIdx).trim()
    const val = trimmed.slice(colonIdx + 1).trim()
    if (val) {
      // Simple value (strip quotes)
      result[key] = val.replace(/^["']|["']$/g, '')
    } else {
      // Nested object — only support one level
      if (key === 'metadata') {
        result.metadata = {}
        currentObj = result.metadata
      }
    }
  }
  return result
}

/**
 * Read a skill's README.md or SKILL.md content.
 */
function readSkillFile(skillsDir, skillName, fileName) {
  // Try exact directory name first, then case-insensitive
  let skillDir = join(skillsDir, skillName)
  if (!existsSync(skillDir)) {
    // Search for case-insensitive match
    if (existsSync(skillsDir)) {
      const entries = readdirSync(skillsDir, { withFileTypes: true })
      const match = entries.find(e => e.isDirectory() && e.name.toLowerCase() === skillName.toLowerCase())
      if (match) {
        skillDir = join(skillsDir, match.name)
      } else {
        return null
      }
    } else {
      return null
    }
  }

  // Try the requested file, then README.md, then SKILL.md
  const candidates = [fileName, 'README.md', 'SKILL.md'].filter(Boolean)
  for (const candidate of candidates) {
    const filePath = join(skillDir, candidate)
    if (existsSync(filePath)) {
      const content = readFileSync(filePath, 'utf8')
      return { fileName: candidate, content, dir: skillDir }
    }
  }
  return null
}

// ── RPC handler ─────────────────────────────────────────────────────────

/**
 * Main RPC dispatch: routes skill-hub/* endpoints to handlers.
 */
async function dispatch(endpoint, payload, signal, config, ctx) {
  // dsh RPC framework wraps the caller's payload as { args: actualPayload }
  const args = (payload && payload.args) ? payload.args : (payload || {})
  const skillhubApi = config.skillhubApiBase || DEFAULT_SKILLHUB_API
  const clawhubApi = config.clawhubApiBase || DEFAULT_CLAWHUB_API
  const preferSkillHub = config.preferSkillHub !== false
  const skillsDir = resolveSkillsDir(config)

  switch (endpoint) {
    case 'skill-hub/search': {
      const { keyword = '', page = 1, pageSize = 60, source, category = '' } = args
      const sources = source ? [source] : (preferSkillHub ? ['skillhub', 'clawhub'] : ['clawhub', 'skillhub'])
      const results = []
      const errors = []

      for (const src of sources) {
        try {
          if (src === 'skillhub') {
            const r = await searchSkillHub(skillhubApi, keyword, page, pageSize, category)
            results.push(r)
          } else if (src === 'clawhub') {
            const limit = Math.min(pageSize, 30)
            const r = await searchClawHub(clawhubApi, keyword, limit)
            results.push(r)
          }
        } catch (e) {
          errors.push({ source: src, error: e.message })
        }
      }

      // Merge and deduplicate by slug (case-insensitive)
      const seen = new Set()
      const merged = []
      for (const r of results) {
        for (const item of r.items) {
          const key = (item.slug || item.name).toLowerCase()
          if (key && !seen.has(key)) {
            seen.add(key)
            merged.push(item)
          }
        }
      }

      // Sort: installed first, then by downloads
      const localSkills = listLocalSkills(skillsDir)
      const localNames = new Set(localSkills.map(s => s.name.toLowerCase()))
      merged.forEach(item => {
        item.installed = localNames.has((item.slug || item.name).toLowerCase())
      })
      merged.sort((a, b) => {
        if (a.installed !== b.installed) return a.installed ? -1 : 1
        return (b.downloads ?? 0) - (a.downloads ?? 0)
      })

      return ok({
        items: merged,
        total: merged.length,
        sources: results.map(r => r.source),
        errors,
      })
    }

    case 'skill-hub/detail': {
      const { slug, source, ownerHandle } = args
      if (!slug) return err('bad-request', 'slug is required')

      let detail = null
      const errors = []

      // Try the specified source first, then fallback
      const trySources = source
        ? [source, ...(source === 'skillhub' ? ['clawhub'] : ['skillhub'])]
        : (preferSkillHub ? ['skillhub', 'clawhub'] : ['clawhub', 'skillhub'])

      for (const src of trySources) {
        try {
          if (src === 'skillhub') {
            detail = await detailSkillHub(skillhubApi, slug)
          } else if (src === 'clawhub') {
            detail = await detailClawHub(clawhubApi, slug, ownerHandle)
          }
          if (detail) break
        } catch (e) {
          errors.push({ source: src, error: e.message })
        }
      }

      if (!detail) {
        // Last resort: try reading from local file system (installed skill)
        const fileData = readSkillFile(skillsDir, slug, 'SKILL.md')
        if (fileData) {
          detail = {
            slug,
            name: slug,
            displayName: slug,
            summary: '',
            readme: fileData.content,
            installed: true,
            source: 'local',
          }
        } else {
          return err('bad-request', `Skill "${slug}" not found`, { errors })
        }
      }

      // If no README from API, try reading from file system (installed skill)
      if (!detail.readme) {
        const localSkills = listLocalSkills(skillsDir)
        const local = localSkills.find(s => s.name.toLowerCase() === slug.toLowerCase())
        if (local) {
          const fileData = readSkillFile(skillsDir, slug, 'README.md')
          if (fileData) {
            detail.readme = fileData.content
            detail.installed = true
          } else {
            const skillMd = readSkillFile(skillsDir, slug, 'SKILL.md')
            if (skillMd) {
              detail.readme = skillMd.content
              detail.installed = true
            }
          }
        } else {
          // Try ctx.skills registry (for plugin-bundled skills)
          if (ctx && ctx.skills) {
            try {
              const regSkill = await ctx.skills.get(slug, { signal })
              if (regSkill && regSkill.content) {
                detail.readme = regSkill.content
                detail.installed = true
              }
            } catch (e) { /* Ignore */ }
          }
          // Try fetching SKILL.md from SkillHub file API
          if (!detail.readme && detail.source !== 'clawhub') {
            try {
              const fileContent = await readFileSkillHub(skillhubApi, slug, 'SKILL.md')
              if (fileContent) {
                detail.readme = fileContent
              }
            } catch (e) {
              // Ignore file fetch errors
            }
          }
        }
      }

      // Check if installed locally (don't override if already determined via ctx.skills)
      if (!detail.installed) {
        const localSkills = listLocalSkills(skillsDir)
        detail.installed = localSkills.some(s => s.name.toLowerCase() === slug.toLowerCase())
      }

      return ok(detail)
    }

    case 'skill-hub/installed': {
      const sourceLabels = {
        'user-dsh': '本地安装',
        'user-agents': '用户Agent',
        'project-dsh': '项目',
        'project-agents': '项目Agent',
        'bundled': '插件自带',
        'custom': '自定义',
        'runtime': '运行时',
      }
      // Try ctx.skills registry first (covers plugin-bundled + user-installed)
      let registrySkills = []
      if (ctx && ctx.skills) {
        try {
          const summaries = await ctx.skills.list({ signal })
          registrySkills = summaries.map(s => ({
            slug: s.name,
            name: s.name,
            displayName: s.name,
            summary: s.description || '',
            description: s.description || '',
            whenToUse: s.whenToUse || '',
            source: s.source || '',
            sourceLabel: sourceLabels[s.source] || s.source || '',
            provider: s.provider || '',
            author: s.provider || '',
            modelInvocable: s.invocation ? s.invocation.modelInvocable : false,
            userInvocable: s.invocation ? s.invocation.userInvocable : false,
            installed: true,
            dir: (s.resourceBase && s.resourceBase.path) || '',
            fromRegistry: true,
          }))
        } catch (e) {
          // Fall through to file scanning
        }
      }
      // Also scan local skills dir for metadata (version, author from frontmatter)
      const localSkills = listLocalSkills(skillsDir)
      if (registrySkills.length > 0) {
        const localMap = {}
        for (const ls of localSkills) {
          localMap[ls.name.toLowerCase()] = ls
        }
        // Merge: enrich registry skills with local metadata, AND add local-only
        // skills that the registry didn't return (e.g. user-installed skills
        // under ~/.dsh/skills/ that ctx.skills.list missed because no cwd was
        // passed to resolve project/user roots).
        const registryNames = new Set(registrySkills.map(rs => rs.name.toLowerCase()))
        // Build merged list: registry skills enriched with local metadata
        const merged = registrySkills.map(rs => {
          const local = localMap[rs.name.toLowerCase()]
          if (local) {
            return Object.assign({}, rs, {
              version: local.version || '',
              author: local.author || rs.author,
              dir: local.dir || rs.dir,
            })
          }
          return rs
        })
        // Append local-only skills not in registry
        for (const ls of localSkills) {
          if (!registryNames.has(ls.name.toLowerCase())) {
            merged.push(Object.assign({}, ls, {
              slug: ls.slug || ls.name,
              displayName: ls.displayName || ls.name,
              summary: ls.summary || ls.description || '',
              source: ls.source || 'user-dsh',
              sourceLabel: sourceLabels['user-dsh'] || '本地安装',
              provider: '',
              author: ls.author || '',
              modelInvocable: true,
              userInvocable: true,
              installed: true,
              dir: ls.dir || '',
              fromRegistry: false,
            }))
          }
        }
        return ok({ skills: merged, dir: skillsDir })
      }
      // Fallback: file scan only
      const localWithLabels = localSkills.map(s => Object.assign({}, s, {
        slug: s.slug || s.name,
        displayName: s.displayName || s.name,
        summary: s.summary || s.description || '',
        sourceLabel: '本地安装',
        installed: true,
      }))
      return ok({ skills: localWithLabels, dir: skillsDir })
    }

    case 'skill-hub/install': {
      const { slug, source, ownerHandle } = args
      if (!slug) return err('bad-request', 'slug is required')

      // Determine which source to use
      const src = source || (preferSkillHub ? 'skillhub' : 'clawhub')
      let zipBuffer

      try {
        if (src === 'skillhub') {
          zipBuffer = await downloadSkillHub(skillhubApi, slug)
        } else {
          zipBuffer = await downloadClawHub(clawhubApi, slug, ownerHandle)
        }
      } catch (e) {
        // Fallback to the other source
        const fallbackSrc = src === 'skillhub' ? 'clawhub' : 'skillhub'
        try {
          if (fallbackSrc === 'skillhub') {
            zipBuffer = await downloadSkillHub(skillhubApi, slug)
          } else {
            zipBuffer = await downloadClawHub(clawhubApi, slug, ownerHandle)
          }
        } catch (e2) {
          return err('bad-request', `Failed to download skill: ${e.message}; fallback also failed: ${e2.message}`)
        }
      }

      // Extract to skills directory
      const targetDir = join(skillsDir, slug)
      // Clean existing directory if any
      if (existsSync(targetDir)) {
        rmSync(targetDir, { recursive: true, force: true })
      }
      mkdirSync(targetDir, { recursive: true })

      try {
        extractZip(zipBuffer, targetDir)
      } catch (e) {
        // Cleanup on failure
        try { rmSync(targetDir, { recursive: true, force: true }) } catch {}
        return err('internal', `Failed to extract skill: ${e.message}`)
      }

      // Verify SKILL.md exists
      const skillMdPath = join(targetDir, 'SKILL.md')
      if (!existsSync(skillMdPath)) {
        // Check if files are in a subdirectory
        const subEntries = readdirSync(targetDir, { withFileTypes: true })
        const subDir = subEntries.find(e => e.isDirectory())
        if (subDir) {
          const subSkillMd = join(targetDir, subDir.name, 'SKILL.md')
          if (existsSync(subSkillMd)) {
            // Move files up
            const subDirPath = join(targetDir, subDir.name)
            const subEntries2 = readdirSync(subDirPath)
            for (const f of subEntries2) {
              const src = join(subDirPath, f.name)
              const dst = join(targetDir, f.name)
              try {
                execSync(`move "${src}" "${dst}"`, { windowsHide: true, stdio: 'pipe' })
              } catch {}
            }
            try { rmSync(subDirPath, { recursive: true, force: true }) } catch {}
          }
        }
      }

      // Final verification
      if (!existsSync(skillMdPath)) {
        return err('bad-request', `Downloaded skill does not contain SKILL.md. Files: ${readdirSync(targetDir).join(', ')}`)
      }

      // Parse the installed skill's metadata
      const content = readFileSync(skillMdPath, 'utf8')
      const meta = parseFrontmatter(content)

      return ok({
        slug,
        name: meta.name ?? slug,
        description: meta.description ?? '',
        installed: true,
        dir: targetDir,
        message: `Skill "${slug}" installed successfully`,
      })
    }

    case 'skill-hub/uninstall': {
      const { slug } = args
      if (!slug) return err('bad-request', 'slug is required')

      const targetDir = join(skillsDir, slug)
      if (!existsSync(targetDir)) {
        // Try case-insensitive search
        if (existsSync(skillsDir)) {
          const entries = readdirSync(skillsDir, { withFileTypes: true })
          const match = entries.find(e => e.isDirectory() && e.name.toLowerCase() === slug.toLowerCase())
          if (match) {
            rmSync(join(skillsDir, match.name), { recursive: true, force: true })
            return ok({ slug, uninstalled: true, message: `Skill "${match.name}" removed` })
          }
        }
        return err('bad-request', `Skill "${slug}" is not installed`)
      }

      rmSync(targetDir, { recursive: true, force: true })
      return ok({ slug, uninstalled: true, message: `Skill "${slug}" removed` })
    }

    case 'skill-hub/readme': {
      const { slug, fileName } = args
      if (!slug) return err('bad-request', 'slug is required')

      // Try local file system first
      const fileData = readSkillFile(skillsDir, slug, fileName)
      if (fileData) {
        const allFiles = existsSync(fileData.dir)
          ? readdirSync(fileData.dir).filter(f => !statSync(join(fileData.dir, f)).isDirectory())
          : []
        return ok({
          slug,
          fileName: fileData.fileName,
          content: fileData.content,
          files: allFiles,
          dir: fileData.dir,
        })
      }

      // Try ctx.skills registry (for plugin-bundled skills not in ~/.dsh/skills)
      if (ctx && ctx.skills) {
        try {
          const skill = await ctx.skills.get(slug, { signal })
          if (skill && skill.content) {
            return ok({
              slug,
              fileName: 'SKILL.md',
              content: skill.content,
              files: [],
              dir: skill.path || '',
            })
          }
        } catch (e) { /* Ignore */ }
      }

      return err('bad-request', `No README or SKILL.md found for "${slug}"`)
    }

    case 'skill-hub/categories': {
      try {
        const url = `${skillhubApi}/api/v1/categories`
        const data = await httpGetJson(url)
        const items = data?.items ?? data?.data ?? []
        return ok({ categories: items })
      } catch (e) {
        return err('internal', `Failed to fetch categories: ${e.message}`)
      }
    }

    default:
      return err('bad-request', `Unknown endpoint: ${endpoint}`)
  }
}

// ── Plugin entry ────────────────────────────────────────────────────────

export const name = 'dsh-skill-hub'
export const inject = ['connection', 'skills']

export function apply(ctx, config = {}) {
  // Merge config from cordis.patch.yml
  const mergedConfig = {
    skillhubApiBase: config.skillhubApiBase || DEFAULT_SKILLHUB_API,
    clawhubApiBase: config.clawhubApiBase || DEFAULT_CLAWHUB_API,
    preferSkillHub: config.preferSkillHub !== false,
    localSkillsDir: config.localSkillsDir || '',
  }

  // 2026-09-02 修复：dsh 0.1.2-alpha 起 /api 共享通道只允许一个 interceptor
  // （官方 dsh-api-gateway 独占），插件再 intercept 会把 gateway 挤掉，导致
  // workspace/session/directoryPicker 等所有官方 /api 端点 404。
  // 改用 exact fetch route（优先级高于 interceptor），与 gateway 共存。
  const ENDPOINTS = [
    'skill-hub/search',
    'skill-hub/detail',
    'skill-hub/installed',
    'skill-hub/install',
    'skill-hub/uninstall',
    'skill-hub/readme',
    'skill-hub/categories',
  ]

  for (const endpoint of ENDPOINTS) {
    ctx.connection.fetch.register({
      path: `/api/${endpoint}`,
      methods: ['POST'],
      fetch: async (request) => {
        if (request.method !== 'POST') return new Response('not found', { status: 404 })
        let body
        try {
          body = await request.json()
        } catch {
          return new Response('body is not JSON', { status: 400 })
        }
        const rpcId = typeof body?.rpcId === 'string' ? body.rpcId : 'invalid-request'
        try {
          const result = await dispatch(endpoint, body?.payload ?? {}, request.signal, mergedConfig, ctx)
          return Response.json({ type: 'server-response', rpcId, result })
        } catch (error) {
          return Response.json({
            type: 'server-response',
            rpcId,
            result: err('internal', error?.message || String(error)),
          })
        }
      },
    })
  }
}
