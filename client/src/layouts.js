function rng(seed) {
  let s = seed >>> 0
  return () => {
    s = Math.imul(s ^ (s >>> 15), 1 | s)
    s ^= s + Math.imul(s ^ (s >>> 7), 61 | s)
    return ((s ^ (s >>> 14)) >>> 0) / 0x100000000
  }
}

function nsHash(name) {
  let h = 0
  for (let i = 0; i < name.length; i++) h = (Math.imul(31, h) + name.charCodeAt(i)) | 0
  return (Math.abs(h) || 1)
}

function groupByNamespace(items) {
  const map = {}
  items.forEach((item, i) => {
    const ns = item.namespace || 'default'
    if (!map[ns]) map[ns] = []
    map[ns].push(i)
  })
  return Object.entries(map).sort(([a], [b]) => a.localeCompare(b))
}

// Apply one layout to a slice of items; seed differentiates random patterns per namespace
function singleNsLayout(items, layout, seed) {
  const n = items.length
  switch (layout) {
    case 'list':          return listLayout(n)
    case 'hierarchy':     return hierarchyLayout(items)
    case 'grid':          return gridLayout(n)
    case 'sphere':        return sphereLayout(n, seed)
    case 'constellation': return constellationLayout(n, seed)
    default:              return scatterLayout(n, seed)
  }
}

const ZONE_GAP = 8

// All layouts are namespace-zone-aware: each namespace occupies its own X slice
export function computePositions(items, layout) {
  const n = items.length
  if (n === 0) return []

  const groups = groupByNamespace(items)

  if (groups.length <= 1) {
    // Single namespace - no zone offset, use standard layout
    return singleNsLayout(items, layout, 0)
  }

  const positions = new Array(n)

  // Compute local positions for each namespace group
  const zoneData = groups.map(([ns, indices]) => {
    const nsItems = indices.map(i => items[i])
    const seed = nsHash(ns)
    const local = singleNsLayout(nsItems, layout, seed)
    const xs = local.map(p => p.x)
    const minX = Math.min(...xs)
    const maxX = Math.max(...xs)
    const width = Math.max(maxX - minX, 3)
    return { indices, local, minX, width }
  })

  const totalWidth = zoneData.reduce((s, z) => s + z.width, 0) + (groups.length - 1) * ZONE_GAP
  let x = -totalWidth / 2

  zoneData.forEach(({ indices, local, minX, width }) => {
    const shift = x - minX
    indices.forEach((itemIdx, li) => {
      positions[itemIdx] = {
        x: local[li].x + shift,
        y: local[li].y,
        z: local[li].z,
      }
    })
    x += width + ZONE_GAP
  })

  return positions
}

function scatterLayout(n, seed = 0) {
  const rand = rng(12345 + seed)
  const radius = Math.max(3.5, Math.sqrt(n) * 1.6)
  return Array.from({ length: n }, () => {
    const angle = rand() * Math.PI * 2
    const r = Math.sqrt(rand()) * radius
    return {
      x: Math.cos(angle) * r,
      y: (rand() - 0.5) * 2.5,
      z: Math.sin(angle) * r * 0.45,
    }
  })
}

function gridLayout(n) {
  const cols = Math.ceil(Math.sqrt(n))
  const rows = Math.ceil(n / cols)
  return Array.from({ length: n }, (_, i) => ({
    x: (i % cols - (cols - 1) / 2) * 3.6,
    y: 0,
    z: (Math.floor(i / cols) - (rows - 1) / 2) * 2.8,
  }))
}

function sphereLayout(n, seed = 0) {
  const radius = Math.max(4, Math.sqrt(n) * 1.5)
  const golden = Math.PI * (3 - Math.sqrt(5))
  return Array.from({ length: n }, (_, i) => {
    const y = 1 - (i / Math.max(n - 1, 1)) * 2
    const r = Math.sqrt(1 - y * y)
    const theta = golden * i
    return {
      x: Math.cos(theta) * r * radius,
      y: y * radius,
      z: Math.sin(theta) * r * radius * 0.45,
    }
  })
}

function constellationLayout(n, seed = 0) {
  const rand = rng(99887 + seed)
  const radius = Math.max(3, Math.sqrt(n) * 1.4)
  return Array.from({ length: n }, (_, i) => {
    const layer = i % 3
    const angle = (i / n) * Math.PI * 4 + rand() * 0.3
    const r = radius + (i % 3) * 1.2 + rand() * 0.8
    return {
      x: Math.cos(angle) * r,
      y: (layer - 1) * 2.5 + (rand() - 0.5) * 0.5,
      z: Math.sin(angle) * r * 0.4,
    }
  })
}

function listLayout(n) {
  const cols = n <= 7 ? 1 : n <= 16 ? 2 : 3
  const spacingX = 3.5
  const spacingY = 1.2
  const totalRows = Math.ceil(n / cols)
  return Array.from({ length: n }, (_, i) => {
    const col = i % cols
    const row = Math.floor(i / cols)
    return {
      x: (col - (cols - 1) / 2) * spacingX,
      y: ((totalRows - 1) / 2 - row) * spacingY,
      z: 0,
    }
  })
}

function hierarchyLayout(items) {
  const groups = {}
  const orphans = []

  items.forEach((item, i) => {
    if (item.ownerRef) {
      if (!groups[item.ownerRef]) groups[item.ownerRef] = []
      groups[item.ownerRef].push(i)
    } else {
      orphans.push(i)
    }
  })

  const positions = new Array(items.length)
  const groupEntries = Object.entries(groups)
  const podSpacing = 3.2
  const groupGap   = 2.5
  const podY       = 0

  let totalWidth = 0
  const groupWidths = groupEntries.map(([, indices]) => {
    const w = Math.max((indices.length - 1) * podSpacing, 0)
    totalWidth += w + groupGap
    return w
  })
  totalWidth = Math.max(totalWidth - groupGap, 0)

  let groupX = -totalWidth / 2

  groupEntries.forEach(([, indices], gi) => {
    const w = groupWidths[gi]
    indices.forEach((idx, pi) => {
      positions[idx] = {
        x: groupX + pi * podSpacing,
        y: podY,
        z: 0,
      }
    })
    groupX += w + groupGap
  })

  const orphanY = orphans.length > 0 ? podY - 4 : podY
  orphans.forEach((idx, i) => {
    positions[idx] = {
      x: (i - (orphans.length - 1) / 2) * podSpacing,
      y: orphanY,
      z: 0,
    }
  })

  return positions
}

// Hub positions for hierarchy layout (deployment centroids + spoke endpoints)
export function computeHubs(items, positions) {
  const groups = {}
  items.forEach((item, i) => {
    if (!item.ownerRef || !positions[i]) return
    if (!groups[item.ownerRef]) groups[item.ownerRef] = { indices: [], label: item.ownerRef }
    groups[item.ownerRef].indices.push(i)
  })

  return Object.entries(groups).map(([ref, { indices, label }]) => {
    const avgX = indices.reduce((s, i) => s + positions[i].x, 0) / indices.length
    const avgZ = indices.reduce((s, i) => s + positions[i].z, 0) / indices.length
    return {
      ref,
      label,
      pos: { x: avgX, y: 3.5, z: avgZ },
      spokes: indices.map(i => positions[i]),
    }
  })
}

// Namespace label positions - centroid + elevated Y
export function computeNamespaceCentroids(items, positions) {
  const ns = {}
  items.forEach((item, i) => {
    if (!positions[i]) return
    if (!ns[item.namespace]) ns[item.namespace] = { xs: [], ys: [], zs: [] }
    ns[item.namespace].xs.push(positions[i].x)
    ns[item.namespace].ys.push(positions[i].y)
    ns[item.namespace].zs.push(positions[i].z)
  })
  return Object.entries(ns).map(([name, { xs, ys, zs }]) => ({
    name,
    x: xs.reduce((a, b) => a + b, 0) / xs.length,
    y: Math.max(...ys) + 3.2,
    z: zs.reduce((a, b) => a + b, 0) / zs.length,
  }))
}

// Zone floor bounds for each namespace - used to draw boundary rectangles
export function computeZoneBounds(items, positions) {
  const ns = {}
  items.forEach((item, i) => {
    if (!positions[i]) return
    const n = item.namespace
    if (!ns[n]) ns[n] = { xs: [], zs: [] }
    ns[n].xs.push(positions[i].x)
    ns[n].zs.push(positions[i].z)
  })

  return Object.entries(ns).map(([name, { xs, zs }]) => {
    const xPad = 2.2
    const zRange = Math.max(...zs) - Math.min(...zs)
    const zPad = zRange < 1 ? 3.5 : 2.2
    return {
      name,
      xMin: Math.min(...xs) - xPad,
      xMax: Math.max(...xs) + xPad,
      zMin: Math.min(...zs) - zPad,
      zMax: Math.max(...zs) + zPad,
    }
  })
}
