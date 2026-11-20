/*
 * iles3d.js : les îles 3D de StudyQuest (une par mode de jeu).
 *
 * Chaque île est construite en « low-poly » : un terrain en facettes colorées, des arbres,
 * des rochers et des bâtiments faits de formes simples. Ce fichier ne charge pas Three.js
 * lui-même : salle3d.js lui donne THREE. Cela permet de le tester sans navigateur.
 *
 * Pour l'instant, seule l'île du mode AVENTURE existe. Les autres modes gardent la salle
 * d'avant. Pour ajouter une île, il suffit d'écrire une fonction comme construireAventure()
 * et de l'ajouter dans la liste ILES, tout en bas de ce fichier.
 */

// ---------- Petits outils ----------
function hasard(graine) {
  let a = graine;
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function bruitValeur(ix, iz) {
  const s = Math.sin(ix * 127.1 + iz * 311.7) * 43758.5453;
  return s - Math.floor(s);
}
function lisse(t) { return t * t * (3 - 2 * t); }
function bruit2d(x, z) {
  const x0 = Math.floor(x);
  const z0 = Math.floor(z);
  const fx = lisse(x - x0);
  const fz = lisse(z - z0);
  const a = bruitValeur(x0, z0);
  const b = bruitValeur(x0 + 1, z0);
  const c = bruitValeur(x0, z0 + 1);
  const d = bruitValeur(x0 + 1, z0 + 1);
  const haut = a + (b - a) * fx;
  const bas = c + (d - c) * fx;
  return haut + (bas - haut) * fz;
}
function borne(v, a, b) { return Math.max(a, Math.min(b, v)); }
function distSegment(px, pz, ax, az, bx, bz) {
  const dx = bx - ax;
  const dz = bz - az;
  const l2 = dx * dx + dz * dz;
  const t = l2 === 0 ? 0 : borne(((px - ax) * dx + (pz - az) * dz) / l2, 0, 1);
  return Math.hypot(px - (ax + dx * t), pz - (az + dz * t));
}
function distLigne(px, pz, pts) {
  let m = 1e9;
  for (let i = 0; i < pts.length - 1; i++) {
    m = Math.min(m, distSegment(px, pz, pts[i][0], pts[i][1], pts[i + 1][0], pts[i + 1][1]));
  }
  return m;
}
function lineaire(c) {
  return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
}
// couleur hexadécimale -> [r, g, b] (espace linéaire, comme les couleurs de sommets de Three.js)
function rvb(hex, facteur) {
  const f = facteur || 1;
  return [
    lineaire(borne(((hex >> 16) & 255) / 255 * f, 0, 1)),
    lineaire(borne(((hex >> 8) & 255) / 255 * f, 0, 1)),
    lineaire(borne((hex & 255) / 255 * f, 0, 1))
  ];
}

function versSrgb(c) {
  return Math.round(255 * (c <= 0.0031308 ? c * 12.92 : 1.055 * Math.pow(c, 1 / 2.4) - 0.055));
}

// ---------- Le terrain : des triangles colorés un par un ----------
function construireTerrain(THREE, taille, cases, hauteur, couleur) {
  const pas = taille / cases;
  const demi = taille / 2;
  const nb = cases + 1;
  const grille = new Float32Array(nb * nb);
  for (let j = 0; j < nb; j++) {
    for (let i = 0; i < nb; i++) grille[j * nb + i] = hauteur(-demi + i * pas, -demi + j * pas);
  }
  const pos = new Float32Array(cases * cases * 18);
  const col = new Float32Array(cases * cases * 18);
  let o = 0;
  const alea = hasard(7);

  function triangle(ax, ay, az, bx, by, bz, cx, cy, cz) {
    const ux = bx - ax, uy = by - ay, uz = bz - az;
    const vx = cx - ax, vy = cy - ay, vz = cz - az;
    let nx = uy * vz - uz * vy;
    let ny = uz * vx - ux * vz;
    let nz = ux * vy - uy * vx;
    const l = Math.hypot(nx, ny, nz) || 1;
    ny /= l;
    const pente = Math.sqrt(Math.max(0, 1 - ny * ny)) / Math.max(ny, 0.05);
    const c = couleur((ax + bx + cx) / 3, (az + bz + cz) / 3, (ay + by + cy) / 3, pente, alea());
    const p = [ax, ay, az, bx, by, bz, cx, cy, cz];
    for (let k = 0; k < 9; k++) pos[o + k] = p[k];
    for (let k = 0; k < 3; k++) {
      col[o + k * 3] = c[0];
      col[o + k * 3 + 1] = c[1];
      col[o + k * 3 + 2] = c[2];
    }
    o += 9;
  }

  for (let j = 0; j < cases; j++) {
    for (let i = 0; i < cases; i++) {
      const x0 = -demi + i * pas, z0 = -demi + j * pas;
      const x1 = x0 + pas, z1 = z0 + pas;
      const y00 = grille[j * nb + i], y10 = grille[j * nb + i + 1];
      const y01 = grille[(j + 1) * nb + i], y11 = grille[(j + 1) * nb + i + 1];
      if ((i + j) % 2 === 0) {
        triangle(x0, y00, z0, x0, y01, z1, x1, y10, z0);
        triangle(x1, y10, z0, x0, y01, z1, x1, y11, z1);
      } else {
        triangle(x0, y00, z0, x0, y01, z1, x1, y11, z1);
        triangle(x0, y00, z0, x1, y11, z1, x1, y10, z0);
      }
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  g.computeVertexNormals();
  const m = new THREE.Mesh(g, new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 1, metalness: 0 }));
  m.receiveShadow = true;
  return m;
}

// ---------- Beaucoup d'objets identiques (arbres, rochers) en un seul dessin ----------
function lotInstances(THREE, geometrie, matiere, max) {
  const mesh = new THREE.InstancedMesh(geometrie, matiere, max);
  const pivot = new THREE.Object3D();
  pivot.rotation.order = 'YXZ';
  const teinte = new THREE.Color();
  let n = 0;
  return {
    mesh: mesh,
    ajouter: function (x, y, z, sx, sy, sz, rotY, couleurHex, rotX, rotZ) {
      if (n >= max) return;
      pivot.position.set(x, y, z);
      pivot.rotation.set(rotX || 0, rotY || 0, rotZ || 0);
      pivot.scale.set(sx, sy, sz);
      pivot.updateMatrix();
      mesh.setMatrixAt(n, pivot.matrix);
      if (couleurHex !== undefined) {
        teinte.setHex(couleurHex);
        mesh.setColorAt(n, teinte);
      }
      n++;
    },
    fin: function () {
      mesh.count = n;
      mesh.instanceMatrix.needsUpdate = true;
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      mesh.frustumCulled = false;
    }
  };
}

// ==========================================================================
//  ÎLE D'AVENTURE : jungle, montagnes, cascade, grotte, ruines, chemins
// ==========================================================================
function construireAventure(THREE, scene, langue) {
  // Chaque décor est construit « à l'essai » : s'il pose problème, seul ce décor est ignoré.
  function essayer(nom, fonction) {
    try {
      fonction();
    } catch (e) {
      console.warn('Décor ignoré (' + nom + ') :', e);
    }
  }
  function tenter(nom, fonction) {
    try {
      return fonction();
    } catch (e) {
      console.warn('Décor ignoré (' + nom + ') :', e);
      return null;
    }
  }
  const TAILLE = 190;
  const alea = hasard(2024);

  // --- les points forts du relief ---
  const MONTAGNES = [
    { x: -14, z: -22, sigma: 11, haut: 17 },   // le grand sommet
    { x: -35, z: 2, sigma: 6.5, haut: 10 },    // la montagne de la grotte
    { x: 25, z: -26, sigma: 7.5, haut: 8 }     // les collines des ruines
  ];
  const PISCINE = { x: -2.5, z: -9.5 };
  const RUINES = { x: 26, z: -9, rayon: 13, hauteur: 5.4 };
  const GROTTE = { x: -27, z: 3 };

  // --- les chemins de terre et la rivière (listes de points x, z) ---
  const CHEMINS = [
    [[0, 40], [1, 32], [2, 22], [2, 14], [5, 5], [1, -2], [0.5, -6.5]],          // plage -> clairière -> cascade
    [[5, 5], [12, -2], [18, -7], [25, -9]],                                       // vers les ruines
    [[1, -2], [-10, -1], [-20, 2], [-27, 3]],                                     // vers la grotte
    [[0.5, -6.5], [-4, -12], [-7, -15], [-10, -17], [-12, -20], [-14, -22]]       // vers le sommet
  ];
  const RIVIERE = [[-2.5, -9.5], [4, -4], [10, 0], [12, 8], [12, 18], [13, 28], [18, 38], [22, 46]];

  // --- les lieux (une mission par lieu, dans l'ordre) ---
  const LIEUX = [
    { nom: 'Cascade', x: 0.5, z: -6.5 },
    { nom: 'Ruines', x: 22.5, z: -9 },
    { nom: 'Grotte', x: -20.5, z: 3 },
    { nom: 'Sommet', x: -14, z: -22 },
    { nom: 'Clairière', x: 5, z: 5 },
    { nom: 'Camp de base', x: 8, z: 28 }
  ];
  const nomsLieux = {
    en: ['Waterfall','Ruins','Cave','Summit','Clearing','Base Camp'],
    es: ['Cascada','Ruinas','Cueva','Cumbre','Claro','Campamento base']
  }[langue];
  if (nomsLieux) LIEUX.forEach(function (lieu, i) { lieu.nom = nomsLieux[i]; });

  function rayonIle(a) {
    return 58 + 5 * Math.sin(3 * a + 1) + 3 * Math.sin(5 * a + 2) + 2 * Math.sin(2 * a);
  }

  // hauteur brute (sans les plateformes plates sous les lieux)
  function hauteurBrute(x, z) {
    const d = Math.hypot(x, z);
    const a = Math.atan2(z, x);
    const r = rayonIle(a);
    const m = Math.max(0, 1 - d / r);
    const s = lisse(m);
    let h = s * 7.4 - 0.9 - Math.max(0, d - r) * 0.08;
    const masque = lisse(Math.min(1, m * 3));
    MONTAGNES.forEach(function (mt) {
      const dd2 = (x - mt.x) * (x - mt.x) + (z - mt.z) * (z - mt.z);
      h += mt.haut * Math.exp(-dd2 / (2 * mt.sigma * mt.sigma)) * masque;
    });
    h += (bruit2d(x * 0.08, z * 0.08) - 0.5) * 4.4 * s;
    h += (bruit2d(x * 0.22, z * 0.22) - 0.5) * 1.4 * s;
    // le bassin de la cascade
    const dp2 = (x - PISCINE.x) * (x - PISCINE.x) + (z - PISCINE.z) * (z - PISCINE.z);
    h -= 1.6 * Math.exp(-dp2 / (2 * 2.6 * 2.6));
    // le lit de la rivière
    const dr = distLigne(x, z, RIVIERE);
    if (dr < 3.2) h -= 0.55 * (1 - lisse(Math.min(1, Math.max(0, (dr - 0.8) / 2.4))));
    return h;
  }

  // plateformes plates : sous chaque lieu et sous les ruines
  const PLATEAUX = LIEUX.map(function (l) {
    return { x: l.x, z: l.z, plat: 2.8, fondu: 6, h: hauteurBrute(l.x, l.z) };
  });
  PLATEAUX.push({ x: RUINES.x, z: RUINES.z, plat: RUINES.rayon - 5, fondu: RUINES.rayon + 3, h: RUINES.hauteur });

  function hauteurTerrain(x, z) {
    let h = hauteurBrute(x, z);
    for (let i = 0; i < PLATEAUX.length; i++) {
      const p = PLATEAUX[i];
      const d = Math.hypot(x - p.x, z - p.z);
      if (d < p.fondu) {
        const w = 1 - lisse(borne((d - p.plat) / (p.fondu - p.plat), 0, 1));
        h += (p.h - h) * w;
      }
    }
    return h;
  }

  // Les passerelles (ponton, pont) sont des plans de marche posés au-dessus du terrain.
  const PASSERELLES = [];
  function ajouterPasserelle(x0, z0, x1, z1, largeur, hDeck, deuxRampes) {
    const p = { ang: Math.atan2(z1 - z0, x1 - x0), long: Math.hypot(x1 - x0, z1 - z0), larg: largeur, h: hDeck, deux: !!deuxRampes };
    p.cx = (x0 + x1) / 2;
    p.cz = (z0 + z1) / 2;
    p.c = Math.cos(p.ang);
    p.s = Math.sin(p.ang);
    PASSERELLES.push(p);
    return p;
  }
  function poidsPasserelle(p, x, z) {
    const dx = x - p.cx;
    const dz = z - p.cz;
    const u = dx * p.c + dz * p.s;
    const v = -dx * p.s + dz * p.c;
    if (Math.abs(v) > p.larg / 2 || Math.abs(u) > p.long / 2) return 0;
    const wDebut = lisse(borne((u + p.long / 2) / 1.5, 0, 1));
    const wFin = p.deux ? lisse(borne((p.long / 2 - u) / 1.5, 0, 1)) : 1;
    return wDebut * wFin;
  }
  // hauteur « pour marcher » : le terrain, plus les passerelles
  function hauteur(x, z) {
    let h = hauteurTerrain(x, z);
    for (let i = 0; i < PASSERELLES.length; i++) {
      const w = poidsPasserelle(PASSERELLES[i], x, z);
      if (w > 0) h += (PASSERELLES[i].h - h) * w;
    }
    return h;
  }

  // --- couleurs des facettes ---
  function couleur(x, z, h, pente, a) {
    const jitter = 0.9 + 0.2 * a;
    if (h < 0.15) return rvb(h > -1.3 ? 0x8fe3d6 : (h > -3 ? 0x4fb8c8 : 0x2a7f9e), jitter);
    if (distLigne(x, z, RIVIERE) < 1.5 && h > 0.2) return rvb(0x4fb3d9, jitter);
    if (h < 0.4) return rvb(0xcdb677, jitter);
    if (h < 1.2) return rvb(0xe8d48a, jitter);
    for (let i = 0; i < CHEMINS.length; i++) {
      if (distLigne(x, z, CHEMINS[i]) < 1.5) return rvb(0xc9a468, jitter);
    }
    if (h > 18.5 && pente < 1.4) return rvb(0xf1f5f9, jitter);
    if (pente > 0.85 || h > 14.5) return rvb(a > 0.5 ? 0x8a8d92 : 0x777b80, jitter);
    if (Math.hypot(x - RUINES.x, z - RUINES.z) < RUINES.rayon - 4) return rvb(0x9aa07a, jitter);
    const tache = bruit2d(x * 0.12, z * 0.12);
    if (h < 3.4) return rvb(tache > 0.5 ? 0x8fc943 : 0x7ab83c, jitter);
    return rvb(tache > 0.5 ? 0x2f8f3d : 0x267a34, jitter);
  }

  // ---------- Ce que construit l'île ----------
  const obstacles = [];
  const casesObstacles = new Map();
  function obstacle(x, z, r) {
    const o = { x: x, z: z, r: r };
    obstacles.push(o);
    const k = Math.floor(x / 8) + ',' + Math.floor(z / 8);
    if (!casesObstacles.has(k)) casesObstacles.set(k, []);
    casesObstacles.get(k).push(o);
  }

  const matieres = {};
  function mat(hex, extra) {
    const cle = hex + JSON.stringify(extra || {});
    if (!matieres[cle]) {
      matieres[cle] = new THREE.MeshStandardMaterial(Object.assign({ color: hex, flatShading: true, roughness: 0.95, metalness: 0 }, extra || {}));
    }
    return matieres[cle];
  }
  function forme(geo, hex, x, y, z, ombre, extra) {
    const m = new THREE.Mesh(geo, mat(hex, extra));
    m.position.set(x, y, z);
    if (ombre !== false) { m.castShadow = true; m.receiveShadow = true; }
    scene.add(m);
    return m;
  }

  // --- terrain, mer, ciel ---
  scene.add(construireTerrain(THREE, TAILLE, 112, hauteurTerrain, couleur));

  // la mer : une grille dont les sommets montent et descendent doucement
  const mer = tenter('mer animée', function () {
    const demi = 200;
    const cases = 64;
    const nb = cases + 1;
    const pos = new Float32Array(nb * nb * 3);
    for (let j = 0; j < nb; j++) {
      for (let i = 0; i < nb; i++) {
        const k = (j * nb + i) * 3;
        pos[k] = -demi + (i / cases) * demi * 2;
        pos[k + 1] = 0;
        pos[k + 2] = -demi + (j / cases) * demi * 2;
      }
    }
    const indices = [];
    for (let j = 0; j < cases; j++) {
      for (let i = 0; i < cases; i++) {
        const p = j * nb + i;
        indices.push(p, p + nb, p + 1, p + 1, p + nb, p + nb + 1);
      }
    }
    const attr = new THREE.BufferAttribute(pos, 3);
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', attr);
    g.setIndex(indices);
    const m = new THREE.Mesh(g, new THREE.MeshStandardMaterial({ color: 0x2aa6c9, transparent: true, opacity: 0.82, roughness: 0.35, metalness: 0.1, flatShading: true }));
    m.frustumCulled = false;
    scene.add(m);
    return {
      maj: function (t) {
        for (let q = 0; q < pos.length; q += 3) {
          const x = pos[q];
          const z = pos[q + 2];
          pos[q + 1] = 0.1 * Math.sin(x * 0.09 + t * 0.9) + 0.09 * Math.sin(z * 0.11 + t * 0.7) + 0.07 * Math.sin((x + z) * 0.05 + t * 0.5);
        }
        attr.needsUpdate = true;
      }
    };
  }) || (function () {
    const m = new THREE.Mesh(new THREE.CircleGeometry(420, 24), new THREE.MeshStandardMaterial({ color: 0x2aa6c9, transparent: true, opacity: 0.8 }));
    m.rotation.x = -Math.PI / 2;
    scene.add(m);
    return { maj: function () {} };
  })();

  function melangerHex(a, b, t) {
    const r = Math.round(((a >> 16) & 255) * (1 - t) + ((b >> 16) & 255) * t);
    const g = Math.round(((a >> 8) & 255) * (1 - t) + ((b >> 8) & 255) * t);
    const bl = Math.round((a & 255) * (1 - t) + (b & 255) * t);
    return (r << 16) | (g << 8) | bl;
  }
  // le ciel : une grande demi-sphère, bleu foncé en haut et clair à l'horizon
  const ciel = tenter('ciel', function () {
    const anneaux = 14;
    const segments = 28;
    const R = 380;
    const pos = [];
    const col = [];
    const idx = [];
    for (let i = 0; i <= anneaux; i++) {
      const phi = (i / anneaux) * Math.PI;
      for (let j = 0; j <= segments; j++) {
        const th = (j / segments) * Math.PI * 2;
        pos.push(R * Math.sin(phi) * Math.cos(th), R * Math.cos(phi), R * Math.sin(phi) * Math.sin(th));
        const t = Math.max(0, Math.cos(phi));
        const c = rvb(melangerHex(0xbfe6f5, 0x3d86d6, Math.pow(t, 0.55)));
        col.push(c[0], c[1], c[2]);
      }
    }
    for (let i = 0; i < anneaux; i++) {
      for (let j = 0; j < segments; j++) {
        const p = i * (segments + 1) + j;
        idx.push(p, p + segments + 1, p + 1, p + 1, p + segments + 1, p + segments + 2);
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(pos), 3));
    g.setAttribute('color', new THREE.BufferAttribute(new Float32Array(col), 3));
    g.setIndex(idx);
    const m = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.DoubleSide, fog: false, depthWrite: false }));
    m.renderOrder = -10;
    m.frustumCulled = false;
    scene.add(m);
    return m;
  });

  const soleilVisible = new THREE.Mesh(new THREE.SphereGeometry(7, 12, 8), new THREE.MeshBasicMaterial({ color: 0xfff2b0 }));
  soleilVisible.material.fog = false;
  soleilVisible.position.set(110, 85, -100);
  scene.add(soleilVisible);
  const halo = new THREE.Mesh(new THREE.SphereGeometry(15, 12, 8), new THREE.MeshBasicMaterial({ color: 0xfff2b0, transparent: true, opacity: 0.22, depthWrite: false }));
  halo.material.fog = false;
  halo.position.set(110, 85, -100);
  scene.add(halo);

  const nuages = [];
  for (let k = 0; k < 12; k++) {
    const g = new THREE.Group();
    const nb = 3 + Math.floor(alea() * 3);
    for (let q = 0; q < nb; q++) {
      const b = new THREE.Mesh(new THREE.IcosahedronGeometry(5 + alea() * 4, 0), mat(0xffffff, { roughness: 1, emissive: 0x9fb8c8, emissiveIntensity: 0.25 }));
      b.position.set(q * 6 - nb * 3, alea() * 2, (alea() - 0.5) * 5);
      b.scale.set(1.3, 0.55, 1);
      g.add(b);
    }
    g.position.set((alea() - 0.5) * 300, 52 + alea() * 12, (alea() - 0.5) * 300);
    scene.add(g);
    nuages.push(g);
  }

  // --- les lots d'objets répétés ---
  const lotTroncs = lotInstances(THREE, new THREE.CylinderGeometry(0.2, 0.32, 1, 6), mat(0xffffff), 460);
  const lotCimes = lotInstances(THREE, new THREE.IcosahedronGeometry(1, 0), mat(0xffffff), 900);
  const feuille = new THREE.BoxGeometry(0.55, 0.07, 2.6);
  feuille.translate(0, 0, 1.3);
  const lotFeuilles = lotInstances(THREE, feuille, mat(0xffffff), 900);
  const lotBuissons = lotInstances(THREE, new THREE.IcosahedronGeometry(0.8, 0), mat(0xffffff), 260);
  const lotRochers = lotInstances(THREE, new THREE.DodecahedronGeometry(1, 0), mat(0xffffff), 200);
  const lotFleurs = lotInstances(THREE, new THREE.IcosahedronGeometry(0.16, 0), mat(0xffffff, { roughness: 0.6 }), 120);
  const lotHerbes = lotInstances(THREE, new THREE.ConeGeometry(0.12, 0.7, 4), mat(0xffffff), 1200);

  function palmier(x, z) {
    const y = hauteur(x, z);
    const haut = 4.5 + alea() * 2.5;
    const incl = (alea() - 0.5) * 0.3;
    const lacet = alea() * 6.28;
    const dx = -Math.sin(incl) * haut * Math.cos(lacet);
    const dz = Math.sin(incl) * haut * Math.sin(lacet);
    const dy = Math.cos(incl) * haut;
    lotTroncs.ajouter(x + dx / 2, y + dy / 2, z + dz / 2, 1, haut, 1, lacet, 0x8a5e34, 0, incl);
    for (let k = 0; k < 6; k++) {
      const yaw = (k / 6) * 6.283 + alea() * 0.4;
      lotFeuilles.ajouter(x + dx, y + dy, z + dz, 1, 1, 1, yaw, alea() > 0.5 ? 0x3da04a : 0x2f8f3d, 0.5 + alea() * 0.3, 0);
    }
    obstacle(x, z, 0.5);
  }

  function arbreJungle(x, z) {
    const y = hauteur(x, z);
    const haut = 3.4 + alea() * 2.6;
    lotTroncs.ajouter(x, y + haut / 2, z, 1.2, haut, 1.2, 0, 0x6b4423);
    const s = 2 + alea() * 1.4;
    lotCimes.ajouter(x, y + haut + s * 0.35, z, s, s * 0.75, s, alea() * 6, alea() > 0.5 ? 0x2c8a3b : 0x1f7030);
    lotCimes.ajouter(x + (alea() - 0.5) * 1.6, y + haut - 0.3, z + (alea() - 0.5) * 1.6, s * 0.7, s * 0.55, s * 0.7, alea() * 6, 0x3aa047);
    obstacle(x, z, 0.55);
  }

  function rocher(x, z, e, hex) {
    lotRochers.ajouter(x, hauteur(x, z) + e * 0.35, z, e, e * 0.75, e * 0.9, alea() * 6, hex || (alea() > 0.5 ? 0x8a8d92 : 0x777b80), alea() * 0.5, alea() * 0.5);
    obstacle(x, z, e * 0.85);
  }

  // --- placement de la végétation (loin des chemins, des lieux et des constructions) ---
  const occupe = new Map();
  function libreDeVegetation(x, z, espace) {
    const kx = Math.floor(x / 3);
    const kz = Math.floor(z / 3);
    for (let i = -1; i <= 1; i++) {
      for (let j = -1; j <= 1; j++) {
        const liste = occupe.get((kx + i) + ',' + (kz + j));
        if (liste) for (let q = 0; q < liste.length; q++) if (Math.hypot(liste[q][0] - x, liste[q][1] - z) < espace) return false;
      }
    }
    return true;
  }
  function marquer(x, z) {
    const k = Math.floor(x / 3) + ',' + Math.floor(z / 3);
    if (!occupe.has(k)) occupe.set(k, []);
    occupe.get(k).push([x, z]);
  }
  function zoneInterdite(x, z) {
    for (let i = 0; i < CHEMINS.length; i++) if (distLigne(x, z, CHEMINS[i]) < 3) return true;
    if (distLigne(x, z, RIVIERE) < 3.5) return true;
    for (let i = 0; i < LIEUX.length; i++) if (Math.hypot(x - LIEUX[i].x, z - LIEUX[i].z) < 6) return true;
    if (Math.hypot(x - RUINES.x, z - RUINES.z) < RUINES.rayon + 1) return true;
    if (Math.hypot(x - GROTTE.x, z - GROTTE.z) < 9) return true;
    if (Math.hypot(x - PISCINE.x, z - PISCINE.z) < 6) return true;
    return false;
  }
  function pentePoint(x, z) {
    return Math.hypot(hauteur(x + 1, z) - hauteur(x - 1, z), hauteur(x, z + 1) - hauteur(x, z - 1)) / 2;
  }

  let nbArbres = 0;
  for (let essai = 0; essai < 12000 && nbArbres < 380; essai++) {
    const x = (alea() - 0.5) * 130;
    const z = (alea() - 0.5) * 130;
    const h = hauteur(x, z);
    if (h < 1.2 || h > 12.5) continue;
    if (bruit2d(x * 0.07 + 5, z * 0.07 + 9) < 0.27) continue;
    if (zoneInterdite(x, z) || pentePoint(x, z) > 0.75) continue;
    const palmeSurPlage = h < 3.2;
    if (!libreDeVegetation(x, z, palmeSurPlage ? 3.2 : 2.6)) continue;
    marquer(x, z);
    if (palmeSurPlage || alea() < 0.2) palmier(x, z); else arbreJungle(x, z);
    nbArbres++;
  }
  for (let essai = 0; essai < 2500; essai++) {
    const x = (alea() - 0.5) * 130;
    const z = (alea() - 0.5) * 130;
    const h = hauteur(x, z);
    if (h < 1.4 || h > 11 || zoneInterdite(x, z) || pentePoint(x, z) > 0.8) continue;
    if (!libreDeVegetation(x, z, 1.4)) continue;
    marquer(x, z);
    const e = 0.7 + alea() * 0.9;
    lotBuissons.ajouter(x, h + 0.3 * e, z, e, e * 0.7, e, alea() * 6, alea() > 0.5 ? 0x3d9a48 : 0x2d7f3a);
    if (alea() < 0.25) lotFleurs.ajouter(x + 0.4, h + 0.9 * e, z, 1, 1, 1, 0, [0xff6b9d, 0xffd166, 0xffffff, 0xff8c42][Math.floor(alea() * 4)]);
  }
  // rochers sur les pentes et en altitude
  let nbRochers = 0;
  for (let essai = 0; essai < 3000 && nbRochers < 90; essai++) {
    const x = (alea() - 0.5) * 120;
    const z = (alea() - 0.5) * 120;
    const h = hauteur(x, z);
    if (h < 1.5 || zoneInterdite(x, z)) continue;
    if (pentePoint(x, z) < 0.6 && h < 12) continue;
    if (!libreDeVegetation(x, z, 2)) continue;
    marquer(x, z);
    rocher(x, z, 0.8 + alea() * 1.6);
    nbRochers++;
  }
  // fleurs dans la clairière
  for (let k = 0; k < 40; k++) {
    const a = alea() * 6.283;
    const r = 2.5 + alea() * 4;
    const x = LIEUX[4].x + Math.cos(a) * r;
    const z = LIEUX[4].z + Math.sin(a) * r;
    lotFleurs.ajouter(x, hauteur(x, z) + 0.15, z, 1, 1, 1, 0, [0xff6b9d, 0xffd166, 0xffffff, 0xc77dff][k % 4]);
  }

  // --- la cascade et son bassin ---
  const hautCascade = { x: -8, z: -16 };
  hautCascade.y = hauteur(hautCascade.x, hautCascade.z);
  const basCascade = { x: PISCINE.x - 0.6, z: PISCINE.z - 1.2 };
  basCascade.y = hauteur(basCascade.x, basCascade.z);
  const yBassin = hauteur(PISCINE.x, PISCINE.z) + 0.95;
  const bassin = forme(new THREE.CircleGeometry(3.5, 14), 0x5cc8f0, PISCINE.x, yBassin, PISCINE.z, false, { transparent: true, opacity: 0.85, emissive: 0x2a6f8f, emissiveIntensity: 0.4 });
  bassin.rotation.x = -Math.PI / 2;
  const dxC = basCascade.x - hautCascade.x;
  const dyC = (basCascade.y + 1) - (hautCascade.y + 0.4);
  const dzC = basCascade.z - hautCascade.z;
  const longueurC = Math.hypot(dxC, dyC, dzC);
  const nappe = forme(new THREE.BoxGeometry(2.2, 0.14, longueurC), 0x9be4ff,
    (hautCascade.x + basCascade.x) / 2, (hautCascade.y + 0.4 + basCascade.y + 1) / 2 + 0.2, (hautCascade.z + basCascade.z) / 2,
    false, { transparent: true, opacity: 0.85, emissive: 0x4aa8d0, emissiveIntensity: 0.5 });
  nappe.lookAt(basCascade.x, basCascade.y + 1.2, basCascade.z);
  const gouttes = [];
  for (let k = 0; k < 10; k++) {
    gouttes.push(forme(new THREE.BoxGeometry(0.3, 0.3, 0.3), 0xffffff, 0, 0, 0, false, { emissive: 0xbfeeff, emissiveIntensity: 0.6 }));
  }
  const brumes = [];
  for (let k = 0; k < 3; k++) {
    brumes.push(forme(new THREE.IcosahedronGeometry(1.2 + k * 0.4, 0), 0xffffff, PISCINE.x - 0.5 + k * 0.7, yBassin + 0.5, PISCINE.z - 1.2 + k * 0.5, false, { transparent: true, opacity: 0.35, emissive: 0xffffff, emissiveIntensity: 0.3 }));
  }
  [[-1.5, -3.4, 1.1], [1.6, -3.8, 0.9], [3.6, -1, 1.0], [-4.3, 0.8, 1.2]].forEach(function (p) {
    rocher(PISCINE.x + p[0], PISCINE.z + p[1], p[2], 0x6e7378);
  });

  // --- la grotte ---
  const yG = hauteur(GROTTE.x, GROTTE.z);
  const dome = forme(new THREE.SphereGeometry(4.2, 7, 5), 0x7d8086, GROTTE.x, yG + 0.3, GROTTE.z);
  dome.scale.set(1.1, 0.85, 1.1);
  forme(new THREE.BoxGeometry(1, 4.2, 1.2), 0x6a6e74, GROTTE.x + 4.1, yG + 1.8, GROTTE.z - 2.2).rotation.y = 0.2;
  forme(new THREE.BoxGeometry(1, 4.2, 1.2), 0x6a6e74, GROTTE.x + 4.1, yG + 1.8, GROTTE.z + 2.2).rotation.y = -0.2;
  forme(new THREE.BoxGeometry(1.1, 0.9, 5.4), 0x6a6e74, GROTTE.x + 4.15, yG + 4.0, GROTTE.z);
  const bouche = forme(new THREE.CircleGeometry(1.9, 14), 0x020305, GROTTE.x + 4.25, yG + 1.7, GROTTE.z, false);
  bouche.material = new THREE.MeshBasicMaterial({ color: 0x020305 });
  bouche.rotation.y = Math.PI / 2;
  forme(new THREE.SphereGeometry(0.28, 6, 4), 0xff9a3c, GROTTE.x + 3.3, yG + 0.9, GROTTE.z + 0.6, false, { emissive: 0xff7a1c, emissiveIntensity: 1.4 });
  const lumiereGrotte = new THREE.PointLight(0xff8a2c, 14, 9);
  lumiereGrotte.position.set(GROTTE.x + 4.6, yG + 1.4, GROTTE.z);
  scene.add(lumiereGrotte);
  obstacle(GROTTE.x, GROTTE.z, 4.6);
  obstacle(GROTTE.x + 4.1, GROTTE.z - 2.2, 0.8);
  obstacle(GROTTE.x + 4.1, GROTTE.z + 2.2, 0.8);

  // --- les ruines ---
  const yR = RUINES.hauteur;
  forme(new THREE.BoxGeometry(16, 0.7, 12), 0x9a9486, RUINES.x, yR + 0.1, RUINES.z);
  for (let k = 0; k < 3; k++) {
    forme(new THREE.BoxGeometry(2, 0.35, 8 - k * 1.2), 0x9a9486, RUINES.x - 8.8 - k * 0.9, yR - 0.15 - k * 0.35, RUINES.z);
  }
  for (let rang = 0; rang < 2; rang++) {
    for (let k = 0; k < 5; k++) {
      const cx = RUINES.x - 5 + k * 2.5;
      const cz = RUINES.z + (rang === 0 ? -3.6 : 3.6);
      const cassee = alea() < 0.4;
      const h = cassee ? 1 + alea() * 1.6 : 3.4 + alea() * 1.8;
      forme(new THREE.CylinderGeometry(0.55, 0.65, h, 8), 0xb8b2a0, cx, yR + 0.45 + h / 2, cz);
      obstacle(cx, cz, 0.75);
      if (cassee) {
        forme(new THREE.CylinderGeometry(0.55, 0.55, 1.4, 8), 0xaaa494, cx + 1.1, yR + 0.95, cz + (rang === 0 ? -1.2 : 1.2)).rotation.z = 1.4;
      } else {
        forme(new THREE.BoxGeometry(1.5, 0.4, 1.5), 0x9a9486, cx, yR + 0.65 + h, cz);
      }
    }
  }
  [-1, 1].forEach(function (c) {
    forme(new THREE.CylinderGeometry(0.6, 0.7, 5.2, 8), 0xb8b2a0, RUINES.x - 9.4, yR + 3.1, RUINES.z + c * 2.6);
    obstacle(RUINES.x - 9.4, RUINES.z + c * 2.6, 0.8);
  });
  forme(new THREE.BoxGeometry(1.4, 0.8, 7.2), 0x9a9486, RUINES.x - 9.4, yR + 5.9, RUINES.z);
  forme(new THREE.BoxGeometry(2.6, 1.2, 2.6), 0xb8b2a0, RUINES.x + 0.5, yR + 0.95, RUINES.z);
  forme(new THREE.OctahedronGeometry(0.5), 0xffd166, RUINES.x + 0.5, yR + 2.4, RUINES.z, false, { emissive: 0xffb300, emissiveIntensity: 1 });
  obstacle(RUINES.x + 0.5, RUINES.z, 1.6);
  for (let k = 0; k < 7; k++) {
    forme(new THREE.BoxGeometry(0.8 + alea(), 0.5 + alea() * 0.4, 0.8 + alea()), 0x8e8a7c, RUINES.x - 7 + alea() * 14, yR + 0.55, RUINES.z + (alea() - 0.5) * 9).rotation.y = alea() * 3;
  }

  // --- le camp de base sur la plage ---
  const campX = LIEUX[5].x - 6;
  const campZ = LIEUX[5].z + 1.5;
  const yC = hauteur(campX, campZ);
  const tente = forme(new THREE.ConeGeometry(2, 2.2, 4), 0xd9534f, campX, yC + 1.1, campZ);
  tente.rotation.y = Math.PI / 4;
  obstacle(campX, campZ, 1.7);
  for (let k = 0; k < 3; k++) {
    forme(new THREE.BoxGeometry(0.9, 0.9, 0.9), 0x9b6b3a, campX + 3 + (k % 2) * 1.0, yC + 0.45 + (k === 2 ? 0.9 : 0), campZ + 0.4 * k).rotation.y = k * 0.3;
  }
  obstacle(campX + 3.4, campZ + 0.4, 1.0);
  const feuX = campX + 1.5;
  const feuZ = campZ + 3.2;
  const yF = hauteur(feuX, feuZ);
  for (let k = 0; k < 3; k++) {
    const b = forme(new THREE.CylinderGeometry(0.1, 0.1, 1.1, 5), 0x5a3a1a, feuX, yF + 0.2, feuZ);
    b.rotation.z = 1.5;
    b.rotation.y = k * 1.05;
  }
  const flamme = forme(new THREE.ConeGeometry(0.38, 0.9, 5), 0xffa31a, feuX, yF + 0.55, feuZ, false, { emissive: 0xff7a00, emissiveIntensity: 1.6 });
  const lumiereFeu = new THREE.PointLight(0xff9a3c, 10, 9);
  lumiereFeu.position.set(feuX, yF + 1.2, feuZ);
  scene.add(lumiereFeu);
  obstacle(feuX, feuZ, 0.7);
  const yP = hauteur(LIEUX[5].x + 4, LIEUX[5].z - 3);
  forme(new THREE.CylinderGeometry(0.1, 0.12, 2.4, 6), 0x7a5230, LIEUX[5].x + 4, yP + 1.2, LIEUX[5].z - 3);
  forme(new THREE.BoxGeometry(1.4, 0.35, 0.1), 0xc9a468, LIEUX[5].x + 4.3, yP + 2.1, LIEUX[5].z - 3).rotation.y = 0.3;
  forme(new THREE.BoxGeometry(1.2, 0.35, 0.1), 0xc9a468, LIEUX[5].x + 3.8, yP + 1.6, LIEUX[5].z - 3).rotation.y = -0.2;
  obstacle(LIEUX[5].x + 4, LIEUX[5].z - 3, 0.4);



  // =====================================================================
  //  AMÉLIORATIONS : ponton, pont, totems, torches, banian, drapeau, arc-en-ciel,
  //  épave, panneaux, herbe, oiseaux et papillons
  // =====================================================================
  const torches = [];
  const animes = { bateau: null, drapeau: null, lianes: [], oiseaux: [], papillons: [] };

  // dernier point du bord de l'île (en partant du centre, dans une direction) où le sol dépasse 1 m
  function pointRivage(angle) {
    let dernier = [Math.cos(angle) * 15, Math.sin(angle) * 15];
    for (let d = 15; d < 95; d += 0.5) {
      const px = Math.cos(angle) * d;
      const pz = Math.sin(angle) * d;
      if (hauteurTerrain(px, pz) >= 1.0) dernier = [px, pz];
      else if (d > 30) break;
    }
    return dernier;
  }

  // points régulièrement espacés le long d'un chemin (avec sa direction)
  function pointsLe(chemin, pas) {
    const sortie = [];
    let reste = pas / 2;
    for (let i = 0; i < chemin.length - 1; i++) {
      const ax = chemin[i][0], az = chemin[i][1], bx = chemin[i + 1][0], bz = chemin[i + 1][1];
      const L = Math.hypot(bx - ax, bz - az);
      const dx = (bx - ax) / L;
      const dz = (bz - az) / L;
      let t = reste;
      while (t < L) {
        sortie.push({ x: ax + dx * t, z: az + dz * t, dx: dx, dz: dz });
        t += pas;
      }
      reste = t - L;
    }
    return sortie;
  }

  // une planche de bois avec un texte (uniquement dans un navigateur)
  function planche(texte, hex) {
    if (typeof document === 'undefined') return null;
    const c = document.createElement('canvas');
    c.width = 512;
    c.height = 128;
    const g = c.getContext('2d');
    g.fillStyle = '#' + hex.toString(16).padStart(6, '0');
    g.fillRect(0, 0, 512, 128);
    g.strokeStyle = '#4a2f14';
    g.lineWidth = 10;
    g.strokeRect(5, 5, 502, 118);
    g.fillStyle = '#2b1a0a';
    g.font = 'bold 64px Arial, sans-serif';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText(texte, 256, 68);
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    return new THREE.Mesh(new THREE.PlaneGeometry(1.7, 0.43), new THREE.MeshBasicMaterial({ map: t, side: THREE.DoubleSide }));
  }

  function torche(x, z) {
    const y = hauteur(x, z);
    if (y < 1.2) return;
    forme(new THREE.CylinderGeometry(0.06, 0.08, 1.7, 5), 0x6b4a2b, x, y + 0.85, z);
    torches.push(forme(new THREE.ConeGeometry(0.15, 0.42, 5), 0xffa31a, x, y + 1.9, z, false, { emissive: 0xff7a00, emissiveIntensity: 1.6 }));
    obstacle(x, z, 0.2);
  }

  // --- le ponton (on peut marcher dessus) et son bateau ---
  essayer('ponton et bateau', function () {
    const ang = (100 * Math.PI) / 180;
    const debut = pointRivage(ang);
    const dx = Math.cos(ang);
    const dz = Math.sin(ang);
    const longueur = 15;
    const fin = [debut[0] + dx * longueur, debut[1] + dz * longueur];
    const hDeck = Math.max(0.9, hauteurTerrain(debut[0], debut[1]));
    ajouterPasserelle(debut[0], debut[1], fin[0], fin[1], 2.4, hDeck, false);
    const ry = -Math.atan2(dz, dx);
    const cx = (debut[0] + fin[0]) / 2;
    const cz = (debut[1] + fin[1]) / 2;
    forme(new THREE.BoxGeometry(longueur, 0.14, 2.4), 0x9b6b3a, cx, hDeck - 0.07, cz).rotation.y = ry;
    for (let k = 0; k <= 6; k++) {
      const t = -longueur / 2 + 1 + k * ((longueur - 2) / 6);
      [-1.1, 1.1].forEach(function (cote) {
        forme(new THREE.CylinderGeometry(0.14, 0.16, 3.2, 6), 0x6b4a2b, cx + dx * t - dz * cote, hDeck - 1.4, cz + dz * t + dx * cote);
      });
    }
    const g = new THREE.Group();
    const coque = new THREE.Mesh(new THREE.BoxGeometry(3.4, 0.55, 1.3), mat(0x8b5a2b));
    coque.castShadow = true;
    g.add(coque);
    const banc = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.12, 1.1), mat(0xc9a468));
    banc.position.set(0, 0.34, 0);
    g.add(banc);
    const proue = new THREE.Mesh(new THREE.ConeGeometry(0.66, 1.1, 4), mat(0x8b5a2b));
    proue.rotation.z = -Math.PI / 2;
    proue.rotation.x = Math.PI / 4;
    proue.position.set(2.2, 0, 0);
    g.add(proue);
    g.position.set(fin[0] - dx * 3 - dz * 2.6, 0.1, fin[1] - dz * 3 + dx * 2.6);
    g.rotation.y = ry + 0.15;
    scene.add(g);
    animes.bateau = g;
  });

  // --- le pont de bois sur la rivière (au croisement du chemin des ruines) ---
  essayer('pont', function () {
    const chemin = CHEMINS[1];
    let meilleur = null;
    let dMin = 1e9;
    for (let i = 0; i < chemin.length - 1; i++) {
      const ax = chemin[i][0], az = chemin[i][1], bx = chemin[i + 1][0], bz = chemin[i + 1][1];
      const L = Math.hypot(bx - ax, bz - az);
      for (let t = 0; t <= L; t += 0.25) {
        const px = ax + ((bx - ax) * t) / L;
        const pz = az + ((bz - az) * t) / L;
        const d = distLigne(px, pz, RIVIERE);
        if (d < dMin) { dMin = d; meilleur = { x: px, z: pz, dx: (bx - ax) / L, dz: (bz - az) / L }; }
      }
    }
    if (!meilleur || dMin > 2.5) return;
    const demi = 3.8;
    const x0 = meilleur.x - meilleur.dx * demi, z0 = meilleur.z - meilleur.dz * demi;
    const x1 = meilleur.x + meilleur.dx * demi, z1 = meilleur.z + meilleur.dz * demi;
    const hDeck = Math.max(hauteurTerrain(x0, z0), hauteurTerrain(x1, z1)) + 0.05;
    ajouterPasserelle(x0, z0, x1, z1, 2.2, hDeck, true);
    const ry = -Math.atan2(meilleur.dz, meilleur.dx);
    forme(new THREE.BoxGeometry(demi * 2, 0.14, 2.2), 0x9b6b3a, meilleur.x, hDeck - 0.07, meilleur.z).rotation.y = ry;
    [-1.05, 1.05].forEach(function (cote) {
      const px = meilleur.x - meilleur.dz * cote;
      const pz = meilleur.z + meilleur.dx * cote;
      forme(new THREE.BoxGeometry(demi * 2, 0.08, 0.08), 0x6b4a2b, px, hDeck + 0.9, pz).rotation.y = ry;
      for (let k = 0; k <= 4; k++) {
        const t = -demi + 0.4 + k * ((demi * 2 - 0.8) / 4);
        forme(new THREE.CylinderGeometry(0.07, 0.07, 1.0, 5), 0x6b4a2b, px + meilleur.dx * t, hDeck + 0.45, pz + meilleur.dz * t);
      }
    });
  });

  essayer('totems', function () {
  // --- les totems de l'entrée des ruines ---
  [-1, 1].forEach(function (c) {
    const tx = RUINES.x - 11.8;
    const tz = RUINES.z + c * 5.4;
    const y = hauteur(tx, tz);
    [0xb5432c, 0x2f8f9d, 0xe8b330, 0x6b4a2b].forEach(function (hex, k) {
      forme(new THREE.BoxGeometry(0.95, 0.95, 0.95), hex, tx, y + 0.5 + k * 0.95, tz).rotation.y = k * 0.2;
    });
    forme(new THREE.ConeGeometry(0.4, 0.8, 4), 0xe8b330, tx + 0.35, y + 4.2, tz).rotation.z = -Math.PI / 2;
    obstacle(tx, tz, 0.75);
  });
  });

  essayer('torches', function () {
  // --- les torches : le long du chemin principal, à l'entrée des ruines et de la grotte ---
  pointsLe(CHEMINS[0], 11).forEach(function (p, k) {
    const cote = k % 2 === 0 ? 1 : -1;
    torche(p.x - p.dz * cote * 2.3, p.z + p.dx * cote * 2.3);
  });
  [-1, 1].forEach(function (c) {
    torche(RUINES.x - 10.6, RUINES.z + c * 3.6);
    torche(GROTTE.x + 6.6, GROTTE.z + c * 3.4);
  });
  });

  // --- le banian géant de la clairière ---
  essayer('banian', function () {
    const bx = -4.5;
    const bz = 3;
    const y = hauteur(bx, bz);
    forme(new THREE.CylinderGeometry(0.8, 1.25, 5, 8), 0x6b4423, bx, y + 2.5, bz);
    for (let k = 0; k < 7; k++) {
      const a = (k / 7) * 6.283;
      const r = forme(new THREE.ConeGeometry(0.5, 2.8, 5), 0x6b4423, bx + Math.cos(a) * 1.05, y + 1.1, bz + Math.sin(a) * 1.05);
      r.rotation.z = Math.cos(a) * 0.45;
      r.rotation.x = -Math.sin(a) * 0.45;
    }
    const verts = [0x2c8a3b, 0x1f7030, 0x3aa047, 0x28803a];
    for (let k = 0; k < 9; k++) {
      const a = (k / 9) * 6.283 + 0.3;
      const r = k === 0 ? 0 : 3.2 + (k % 3) * 0.7;
      const e = 3 + (k % 4) * 0.45;
      forme(new THREE.IcosahedronGeometry(e, 0), verts[k % 4], bx + Math.cos(a) * r, y + 6.4 + (k % 3) * 0.6, bz + Math.sin(a) * r).scale.set(1, 0.7, 1);
    }
    for (let k = 0; k < 22; k++) {
      const a = alea() * 6.283;
      const r = 2.2 + alea() * 4.2;
      const longu = 2.5 + alea() * 2.8;
      const g = new THREE.Group();
      g.position.set(bx + Math.cos(a) * r, y + 6.0, bz + Math.sin(a) * r);
      const liane = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, longu, 4), mat(0x2f6b2f));
      liane.position.y = -longu / 2;
      g.add(liane);
      scene.add(g);
      animes.lianes.push({ g: g, ph: alea() * 6 });
    }
    obstacle(bx, bz, 1.6);
  });

  // --- le drapeau et le cairn au sommet ---
  essayer('drapeau', function () {
    const l = LIEUX[3];
    const fx = l.x + 1.6;
    const fz = l.z - 0.9;
    const y = hauteur(fx, fz);
    forme(new THREE.CylinderGeometry(0.06, 0.07, 3.6, 6), 0xd8d8d8, fx, y + 1.8, fz);
    const g = new THREE.Group();
    g.position.set(fx, y + 3.1, fz);
    const drap = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.65, 0.04), mat(0xe63946, { emissive: 0x7a0f18, emissiveIntensity: 0.4 }));
    drap.position.x = 0.55;
    drap.castShadow = true;
    g.add(drap);
    scene.add(g);
    animes.drapeau = g;
    obstacle(fx, fz, 0.3);
    for (let k = 0; k < 5; k++) {
      forme(new THREE.BoxGeometry(1.2 - k * 0.2, 0.4, 1.0 - k * 0.15), 0x8a8d92, l.x - 1.4, hauteur(l.x - 1.4, l.z + 0.9) + 0.2 + k * 0.4, l.z + 0.9).rotation.y = k * 0.5;
    }
    obstacle(l.x - 1.4, l.z + 0.9, 0.8);
  });

  essayer('arc-en-ciel', function () {
  // --- l'arc-en-ciel au-dessus de la cascade ---
  [0xff3b3b, 0xff9f1c, 0xffe14d, 0x4cd964, 0x3db5ff, 0x8f6bff].forEach(function (hex, k) {
    const t = new THREE.Mesh(
      new THREE.TorusGeometry(6.4 - k * 0.2, 0.1, 6, 30, Math.PI),
      new THREE.MeshBasicMaterial({ color: hex, transparent: true, opacity: 0.45, depthWrite: false })
    );
    t.position.set(PISCINE.x, yBassin + 0.3, PISCINE.z - 3.2);
    scene.add(t);
  });
  });

  // --- l'épave échouée sur la plage sud-ouest ---
  essayer('épave', function () {
    const ang = (135 * Math.PI) / 180;
    const p = pointRivage(ang);
    const px = p[0] + Math.cos(ang) * 2.2;
    const pz = p[1] + Math.sin(ang) * 2.2;
    const y = Math.max(0.35, hauteur(px, pz));
    const yaw = -ang + 0.5;
    const g = new THREE.Group();
    g.position.set(px, y + 0.2, pz);
    g.rotation.y = yaw;
    g.rotation.z = 0.28;
    const coque = new THREE.Mesh(new THREE.BoxGeometry(6.6, 1.1, 2.2), mat(0x7a4a22));
    coque.castShadow = true;
    g.add(coque);
    for (let k = 0; k < 5; k++) {
      [-1, 1].forEach(function (cote) {
        const c = new THREE.Mesh(new THREE.BoxGeometry(0.12, 1.5 + (k % 2) * 0.5, 0.14), mat(0x5a3a1a));
        c.position.set(-2.4 + k * 1.2, 1.1, cote * 1.0);
        c.castShadow = true;
        g.add(c);
      });
    }
    const mat1 = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.14, 5.2, 6), mat(0x6b4a2b));
    mat1.position.set(0.8, 3.0, 0);
    mat1.rotation.z = 0.35;
    mat1.castShadow = true;
    g.add(mat1);
    const voile = new THREE.Mesh(new THREE.BoxGeometry(0.05, 2.2, 1.7), mat(0xe8dcc0));
    voile.position.set(0.2, 3.2, 0);
    voile.rotation.z = 0.35;
    g.add(voile);
    scene.add(g);
    [-2.2, 0, 2.2].forEach(function (t) { obstacle(px + Math.cos(yaw) * t, pz - Math.sin(yaw) * t, 1.4); });
  });

  // --- le panneau de direction avant la clairière ---
  essayer('panneau', function () {
    const sx = 4.8;
    const sz = 12.5;
    const y = hauteur(sx, sz);
    forme(new THREE.CylinderGeometry(0.08, 0.1, 2.9, 6), 0x7a5230, sx, y + 1.45, sz);
    obstacle(sx, sz, 0.3);
    const nomsPanneau = langue === 'en' ? ['Waterfall','Ruins','Cave','Summit'] : langue === 'es' ? ['Cascada','Ruinas','Cueva','Cumbre'] : ['Cascade','Ruines','Grotte','Sommet'];
    [[nomsPanneau[0], 0xd9b36b, 1.0, 0.25], [nomsPanneau[1], 0xc9a468, 1.55, -0.1], [nomsPanneau[2], 0xd9b36b, 2.1, 0.12], [nomsPanneau[3], 0xc9a468, 2.65, -0.2]].forEach(function (t) {
      const pl = planche(t[0], t[1]);
      if (!pl) return;
      pl.position.set(sx, y + t[2] + 0.1, sz + 0.07);
      pl.rotation.y = t[3];
      scene.add(pl);
    });
  });

  essayer('herbe', function () {
  // --- l'herbe : des centaines de petites touffes ---
  for (let essai = 0, nHerbes = 0; essai < 9000 && nHerbes < 1100; essai++) {
    const x = (alea() - 0.5) * 120;
    const z = (alea() - 0.5) * 120;
    const h = hauteur(x, z);
    if (h < 1.3 || h > 7.5) continue;
    if (distLigne(x, z, RIVIERE) < 2 || pentePoint(x, z) > 0.6) continue;
    let surChemin = false;
    for (let i = 0; i < CHEMINS.length; i++) {
      if (distLigne(x, z, CHEMINS[i]) < 1.7) { surChemin = true; break; }
    }
    if (surChemin || Math.hypot(x - RUINES.x, z - RUINES.z) < RUINES.rayon - 4) continue;
    const e = 0.7 + alea() * 0.8;
    lotHerbes.ajouter(x, h + 0.3 * e, z, e, e, e, alea() * 6, [0x6fb83a, 0x7ac143, 0x5aa832, 0x86cf4a][Math.floor(alea() * 4)]);
    nHerbes++;
  }
  });

  essayer('oiseaux', function () {
  // --- les oiseaux qui tournent au-dessus de l'île ---
  for (let k = 0; k < 6; k++) {
    const g = new THREE.Group();
    g.add(new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.12, 0.5), mat(0x333344)));
    const geoD = new THREE.BoxGeometry(0.9, 0.03, 0.26);
    geoD.translate(0.45, 0, 0);
    const geoG = new THREE.BoxGeometry(0.9, 0.03, 0.26);
    geoG.translate(-0.45, 0, 0);
    const aileD = new THREE.Mesh(geoD, mat(0x444455));
    const aileG = new THREE.Mesh(geoG, mat(0x444455));
    g.add(aileD);
    g.add(aileG);
    scene.add(g);
    animes.oiseaux.push({ g: g, aileD: aileD, aileG: aileG, angle: alea() * 6.283, vit: 0.08 + alea() * 0.06, R: 22 + alea() * 28, h: 26 + alea() * 14, p: alea() * 6 });
  }
  });

  essayer('papillons', function () {
  // --- les papillons de la clairière ---
  for (let k = 0; k < 8; k++) {
    const g = new THREE.Group();
    const couleurAile = [0xff6b9d, 0xffd166, 0xc77dff, 0xffffff][k % 4];
    const geoD = new THREE.PlaneGeometry(0.22, 0.22);
    geoD.rotateX(-Math.PI / 2);
    geoD.translate(0.12, 0, 0);
    const geoG = new THREE.PlaneGeometry(0.22, 0.22);
    geoG.rotateX(-Math.PI / 2);
    geoG.translate(-0.12, 0, 0);
    const matAile = mat(couleurAile, { side: THREE.DoubleSide, emissive: couleurAile, emissiveIntensity: 0.25 });
    const ailD = new THREE.Mesh(geoD, matAile);
    const ailG = new THREE.Mesh(geoG, matAile);
    g.add(ailD);
    g.add(ailG);
    scene.add(g);
    const cx = LIEUX[4].x + (alea() - 0.5) * 8;
    const cz = LIEUX[4].z + (alea() - 0.5) * 8;
    animes.papillons.push({ g: g, ailD: ailD, ailG: ailG, cx: cx, cz: cz, r: 1.5 + alea() * 2.5, ang: alea() * 6.283, vit: 0.5 + alea() * 0.5, base: hauteur(cx, cz) + 1.1 + alea() * 0.8, ph: alea() * 6 });
  }
  });

  [lotTroncs, lotCimes, lotFeuilles, lotBuissons, lotRochers, lotFleurs, lotHerbes].forEach(function (lot) {
    lot.fin();
    scene.add(lot.mesh);
  });

  // --- départ : au bord de la plage sud, face à l'île ---
  let zDepart = 80;
  while (zDepart > 0 && hauteur(0, zDepart) < 0.7) zDepart -= 0.5;
  const depart = { x: 0, z: zDepart - 1.5, cap: 0 };

  // ---------- Ce que l'île donne à salle3d.js ----------
  function libre(x, z, rayon) {
    const r = rayon === undefined ? 0.4 : rayon;
    if (hauteur(x, z) < 0.15) return false;
    const kx = Math.floor(x / 8);
    const kz = Math.floor(z / 8);
    for (let i = -1; i <= 1; i++) {
      for (let j = -1; j <= 1; j++) {
        const liste = casesObstacles.get((kx + i) + ',' + (kz + j));
        if (!liste) continue;
        for (let q = 0; q < liste.length; q++) {
          if (Math.hypot(liste[q].x - x, liste[q].z - z) < liste[q].r + r) return false;
        }
      }
    }
    return true;
  }

  // Si (x, z) est dans un obstacle, renvoie le point le plus proche juste à côté : on glisse autour au lieu de rester coincé.
  function pousser(x, z, rayon) {
    const r = rayon === undefined ? 0.4 : rayon;
    let px = x;
    let pz = z;
    for (let tour = 0; tour < 3; tour++) {
      const kx = Math.floor(px / 8);
      const kz = Math.floor(pz / 8);
      for (let i = -1; i <= 1; i++) {
        for (let j = -1; j <= 1; j++) {
          const liste = casesObstacles.get((kx + i) + ',' + (kz + j));
          if (!liste) continue;
          for (let q = 0; q < liste.length; q++) {
            const o = liste[q];
            const d = Math.hypot(px - o.x, pz - o.z);
            const mini = o.r + r + 0.001;
            if (d < mini) {
              if (d < 0.0001) { px = o.x + mini; } else { px = o.x + ((px - o.x) / d) * mini; pz = o.z + ((pz - o.z) / d) * mini; }
            }
          }
        }
      }
    }
    return [px, pz];
  }

  function maj(dt, temps, joueur) {
    const jx = joueur ? joueur.x : 0;
    const jz = joueur ? joueur.z : 0;
    if (ciel) ciel.position.set(jx, 0, jz);
    soleilVisible.position.set(jx + 110, 85, jz - 100);
    halo.position.set(jx + 110, 85, jz - 100);
    nuages.forEach(function (n) {
      n.position.x += dt * 1.4;
      if (n.position.x > 170) n.position.x = -170;
    });
    mer.maj(temps);
    gouttes.forEach(function (g, i) {
      const t = (temps * 0.55 + i / gouttes.length) % 1;
      g.position.set(
        hautCascade.x + dxC * t + Math.sin(i * 2.1) * 0.7,
        hautCascade.y + 0.6 + (basCascade.y + 1.1 - hautCascade.y - 0.6) * t,
        hautCascade.z + dzC * t
      );
    });
    brumes.forEach(function (b, i) {
      const e = 1 + Math.sin(temps * 1.3 + i * 1.7) * 0.12;
      b.scale.set(e, e * 0.8, e);
    });
    lumiereFeu.intensity = 9 + Math.sin(temps * 17) * 1.6 + Math.sin(temps * 9.3) * 1.2;
    flamme.scale.set(1, 0.9 + Math.sin(temps * 13) * 0.18, 1);
    lumiereGrotte.intensity = 13 + Math.sin(temps * 3.1) * 2;

    torches.forEach(function (f, i) { f.scale.set(1, 0.85 + Math.sin(temps * 11 + i * 1.7) * 0.2, 1); });
    if (animes.bateau) {
      animes.bateau.position.y = 0.1 + Math.sin(temps * 1.1) * 0.07;
      animes.bateau.rotation.z = Math.sin(temps * 0.9) * 0.04;
    }
    if (animes.drapeau) animes.drapeau.rotation.y = Math.sin(temps * 3.2) * 0.35;
    animes.lianes.forEach(function (l) { l.g.rotation.z = Math.sin(temps * 0.8 + l.ph) * 0.08; });
    animes.oiseaux.forEach(function (o) {
      o.angle += dt * o.vit;
      o.g.position.set(Math.cos(o.angle) * o.R, o.h + Math.sin(temps * 0.7 + o.p) * 1.2, Math.sin(o.angle) * o.R);
      o.g.rotation.y = -o.angle;
      o.aileD.rotation.z = Math.sin(temps * 9 + o.p) * 0.7;
      o.aileG.rotation.z = -Math.sin(temps * 9 + o.p) * 0.7;
    });
    animes.papillons.forEach(function (b) {
      b.ang += dt * b.vit;
      b.g.position.set(b.cx + Math.cos(b.ang) * b.r, b.base + Math.sin(temps * 2 + b.ph) * 0.3, b.cz + Math.sin(b.ang * 1.3) * b.r);
      b.g.rotation.y = -b.ang;
      b.ailD.rotation.z = Math.sin(temps * 14 + b.ph) * 0.9;
      b.ailG.rotation.z = -Math.sin(temps * 14 + b.ph) * 0.9;
    });
  }

  // le type de sol sous les pieds (pour le bruit des pas)
  function typeSol(x, z) {
    for (let i = 0; i < PASSERELLES.length; i++) {
      if (poidsPasserelle(PASSERELLES[i], x, z) > 0.5) return 'bois';
    }
    const h = hauteurTerrain(x, z);
    if (distLigne(x, z, RIVIERE) < 1.6 && h > 0.2) return 'eau';
    if (h < 1.2) return 'sable';
    const pente = Math.hypot(hauteurTerrain(x + 1, z) - hauteurTerrain(x - 1, z), hauteurTerrain(x, z + 1) - hauteurTerrain(x, z - 1)) / 2;
    if (pente > 0.85 || h > 14.5) return 'roche';
    if (Math.hypot(x - RUINES.x, z - RUINES.z) < RUINES.rayon - 4) return 'roche';
    return 'herbe';
  }

  // dessine l'île vue du dessus dans un canvas (pour la mini-carte)
  function dessinerCarte(ctx, px) {
    const n = px + 2;
    const g = new Float32Array(n * n);
    for (let j = 0; j < n; j++) {
      for (let i = 0; i < n; i++) g[j * n + i] = hauteurTerrain(((i - 1) / px - 0.5) * TAILLE, ((j - 1) / px - 0.5) * TAILLE);
    }
    const img = ctx.createImageData(px, px);
    const pas = TAILLE / px;
    for (let j = 0; j < px; j++) {
      for (let i = 0; i < px; i++) {
        const x = (i / px - 0.5) * TAILLE;
        const z = (j / px - 0.5) * TAILLE;
        const h = g[(j + 1) * n + i + 1];
        const gx = (g[(j + 1) * n + i + 2] - g[(j + 1) * n + i]) / (2 * pas);
        const gz = (g[(j + 2) * n + i + 1] - g[j * n + i + 1]) / (2 * pas);
        let c;
        if (h < 0.15) {
          c = couleur(x, z, h, 0, 0.5).map(versSrgb);
        } else {
          const rv = couleur(x, z, h, Math.hypot(gx, gz), 0.5).map(versSrgb);
          const ombre = 1 + 0.3 * (gx + gz);
          c = rv.map(function (v) { return Math.max(0, Math.min(255, Math.round(v * ombre))); });
        }
        const o = (j * px + i) * 4;
        img.data[o] = c[0];
        img.data[o + 1] = c[1];
        img.data[o + 2] = c[2];
        img.data[o + 3] = 255;
      }
    }
    ctx.putImageData(img, 0, 0);
  }

  return {
    nom: 'aventure',
    lieux: LIEUX,
    depart: depart,
    taille: TAILLE,
    hauteur: hauteur,
    libre: libre,
    pousser: pousser,
    ciel: 0x8fd3f4,
    brume: [0xbfe6f5, 45, 200],
    hemi: [0xbfe8ff, 0x4c7a3a, 2.3],
    soleil: { couleur: 0xfff1cf, intensite: 3.2, decalage: [32, 46, 22] },
    maj: maj,
    typeSol: typeSol,
    dessinerCarte: dessinerCarte,
    ambiance: { cascade: { x: PISCINE.x, z: PISCINE.z - 1 } },
    _outils: { couleur: couleur, obstacles: obstacles, PASSERELLES: PASSERELLES, animes: animes, torches: torches, CHEMINS: CHEMINS, RIVIERE: RIVIERE, RUINES: RUINES, GROTTE: GROTTE, PISCINE: PISCINE }
  };
}

// ---------- La liste des îles (une par mode) ----------
const ILES = {
  aventure: construireAventure
  // enquete, survie, strategie : à venir
};

export function ileExiste(mode) {
  return typeof ILES[mode] === 'function';
}

export function creerIle(THREE, mode, scene, langue) {
  return ILES[mode] ? ILES[mode](THREE, scene, langue || 'en') : null;
}
