// Groups faces of the same person (average-linkage agglomerative clustering on cosine distance).
// The full merge tree is built once; moving the "Grouping" slider just re-cuts it, which is instant.

export function buildTree(embeddings) {
  const n = embeddings.length;
  const merges = [];
  if (n < 2) return { n, merges };

  const D = new Float32Array(n * n);
  for (let i = 0; i < n; i++) {
    const a = embeddings[i];
    for (let j = i + 1; j < n; j++) {
      const b = embeddings[j];
      let dot = 0;
      for (let k = 0; k < a.length; k++) dot += a[k] * b[k];
      D[i * n + j] = D[j * n + i] = 1 - dot;
    }
  }

  // Nearest-neighbour chain: valid for average linkage and O(n^2).
  const size = new Int32Array(n).fill(1);
  const active = new Uint8Array(n).fill(1);
  const chain = [];
  let remaining = n;
  while (remaining > 1) {
    if (!chain.length) chain.push(active.indexOf(1));
    for (;;) {
      const a = chain[chain.length - 1];
      const prev = chain.length > 1 ? chain[chain.length - 2] : -1;
      let best = prev, bestD = prev >= 0 ? D[a * n + prev] : Infinity;
      for (let k = 0; k < n; k++) {
        if (active[k] && k !== a && D[a * n + k] < bestD) { best = k; bestD = D[a * n + k]; }
      }
      if (best !== prev) { chain.push(best); continue; }

      chain.pop(); chain.pop();
      const keep = Math.min(a, prev), drop = Math.max(a, prev);
      const sa = size[a], sp = size[prev];
      for (let k = 0; k < n; k++) {
        if (!active[k] || k === a || k === prev) continue;
        const d = (sa * D[a * n + k] + sp * D[prev * n + k]) / (sa + sp);
        D[keep * n + k] = D[k * n + keep] = d;
      }
      size[keep] = sa + sp;
      active[drop] = 0;
      remaining--;
      merges.push([keep, drop, bestD]);
      break;
    }
  }
  merges.sort((x, y) => x[2] - y[2]);
  return { n, merges };
}

// Cut the tree: faces whose groups are on average at least `grouping` similar end up together.
export function cutTree({ n, merges }, grouping) {
  const parent = Int32Array.from({ length: n }, (_, i) => i);
  const find = i => { while (parent[i] !== i) i = parent[i] = parent[parent[i]]; return i; };
  const maxDistance = 1 - grouping;
  for (const [a, b, d] of merges) {
    if (d > maxDistance) break;
    parent[find(b)] = find(a);
  }
  return Array.from({ length: n }, (_, i) => find(i));
}

export function dot(a, b) {
  let s = 0;
  for (let i = 0; i < a.length; i++) s += a[i] * b[i];
  return s;
}

export function normalise(v) {
  const n = Math.sqrt(dot(v, v)) || 1;
  return v.map(x => x / n);
}
