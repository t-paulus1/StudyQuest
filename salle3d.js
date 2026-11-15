/*
 * salle3d.js : la « salle d'exploration » 3D de StudyQuest.
 *
 * Contrôleur à la première personne construit avec Three.js : souris pour regarder,
 * ZQSD / WASD / flèches pour marcher, Maj pour courir, E pour ouvrir une mission.
 *
 * Il reprend les idées du « first-person-starter-kit » d'Augusto Polonio
 * (https://github.com/augustopolonio/first-person-starter-kit, licence MIT) :
 * verrouillage du pointeur, déplacement relatif à la caméra, course, sol avec grille,
 * ombres douces et brouillard. Le code a été réécrit pour StudyQuest.
 * Three.js (https://threejs.org) est sous licence MIT.
 *
 * Ce fichier ne touche pas au reste de la page : index.html lui donne un conteneur
 * et reçoit des « événements » (onOuvrir, onProche, onVerrou, onErreur).
 */
import * as THREE from '/vendor/three/three.module.js';
import { creerIle } from './iles3d.js';

const THEMES = {
  enquete:   { ciel: 0x0b1622, brume: 0x0b1622, sol: 0x1b2f45, accent: 0xf4a736, decor: 'colonne',  lumiere: 0.6 },
  aventure:  { ciel: 0x87ceeb, brume: 0xa8d8ee, sol: 0x3f7f3a, accent: 0xffd166, decor: 'arbre',    lumiere: 1.1 },
  survie:    { ciel: 0xff9a5a, brume: 0xe08a58, sol: 0x6b4a32, accent: 0x7df9ff, decor: 'rocher',   lumiere: 0.9 },
  strategie: { ciel: 0x1b1840, brume: 0x1b1840, sol: 0x2d2a63, accent: 0x6ec6ff, decor: 'immeuble', lumiere: 0.7 }
};
const COULEUR_FAIT = 0x2ecc71;

const HAUTEUR_YEUX = 1.7;
const VITESSE = 4;          // mètres par seconde
const COEF_COURSE = 1.8;    // Maj
const SENSIBILITE = 0.0022;
const RAYON_SALLE = 26;
const DISTANCE_OUVERTURE = 2.6;

function hasard(graine) {
  let a = graine;
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function matiere(couleur) {
  return new THREE.MeshStandardMaterial({ color: couleur, roughness: 0.9, metalness: 0 });
}

function enCss(couleur) {
  return '#' + couleur.toString(16).padStart(6, '0');
}

function etiquetteTexture(texte, couleur) {
  const c = document.createElement('canvas');
  c.width = 512;
  c.height = 128;
  const g = c.getContext('2d');
  g.fillStyle = 'rgba(10, 10, 25, 0.78)';
  g.fillRect(0, 0, 512, 128);
  g.strokeStyle = enCss(couleur);
  g.lineWidth = 8;
  g.strokeRect(4, 4, 504, 120);
  g.fillStyle = '#ffffff';
  let taillePolice = 54;
  g.font = 'bold ' + taillePolice + 'px Arial, sans-serif';
  while (g.measureText(texte).width > 470 && taillePolice > 24) {
    taillePolice -= 2;
    g.font = 'bold ' + taillePolice + 'px Arial, sans-serif';
  }
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText(texte, 256, 68);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function fabriquerDecor(type) {
  const groupe = new THREE.Group();
  const hasardDecor = hasard(42);

  const geoTronc = new THREE.CylinderGeometry(0.3, 0.4, 2, 8);
  const geoCime = new THREE.ConeGeometry(1.6, 3.8, 10);
  const geoColonne = new THREE.BoxGeometry(1.2, 7, 1.2);
  const geoRocher = new THREE.DodecahedronGeometry(1.6);
  const geoImmeuble = new THREE.BoxGeometry(3, 1, 3);
  const matTronc = matiere(0x6b4423);
  const matCime = matiere(0x2e8b57);
  const matColonne = matiere(0x2c4a66);
  const matRocher = matiere(0x7a5c45);
  const matImmeuble = matiere(0x4a4690);

  for (let k = 0; k < 44; k++) {
    const angle = hasardDecor() * Math.PI * 2;
    const distance = 30 + hasardDecor() * 18;
    const x = Math.sin(angle) * distance;
    const z = -Math.cos(angle) * distance;
    let objet;

    if (type === 'arbre') {
      objet = new THREE.Group();
      const tronc = new THREE.Mesh(geoTronc, matTronc);
      tronc.position.y = 1;
      const cime = new THREE.Mesh(geoCime, matCime);
      cime.position.y = 3.9;
      objet.add(tronc);
      objet.add(cime);
    } else if (type === 'colonne') {
      objet = new THREE.Mesh(geoColonne, matColonne);
      objet.position.y = 3.5;
    } else if (type === 'rocher') {
      objet = new THREE.Mesh(geoRocher, matRocher);
      objet.position.y = 1;
      const e = 0.7 + hasardDecor() * 1.3;
      objet.scale.set(e, e * 0.8, e);
    } else {
      const hauteur = 6 + hasardDecor() * 12;
      objet = new THREE.Mesh(geoImmeuble, matImmeuble);
      objet.scale.set(1, hauteur, 1);
      objet.position.y = hauteur / 2;
    }

    objet.position.x = x;
    objet.position.z = z;
    objet.traverse(function (o) { if (o.isMesh) o.castShadow = true; });
    groupe.add(objet);
  }
  return groupe;
}

// ---------- Les sons de l'île : vagues, vent, oiseaux, cascade et bruit des pas ----------
function creerAmbiance(optionsAudio) {
  let ctx = null;
  let maitre = null;
  let vagues = null;
  let vent = null;
  let cascade = null;
  let bufferBruit = null;
  let sonOn = optionsAudio.son !== false;
  let prochainOiseau = 3;
  let suspendu = false;

  function fabriquerBruit(secondes) {
    const l = Math.floor(ctx.sampleRate * secondes);
    const b = ctx.createBuffer(1, l, ctx.sampleRate);
    const d = b.getChannelData(0);
    for (let i = 0; i < l; i++) d[i] = Math.random() * 2 - 1;
    return b;
  }

  function boucle(type, freq, q) {
    const src = ctx.createBufferSource();
    src.buffer = bufferBruit;
    src.loop = true;
    const f = ctx.createBiquadFilter();
    f.type = type;
    f.frequency.value = freq;
    if (q) f.Q.value = q;
    const g = ctx.createGain();
    g.gain.value = 0;
    src.connect(f);
    f.connect(g);
    g.connect(maitre);
    src.start();
    return g;
  }

  // doit être appelé après un clic de l'élève (les navigateurs interdisent le son avant)
  function demarrer() {
    try {
      if (!ctx) {
        const Ctx = window.AudioContext || window.webkitAudioContext;
        if (!Ctx) return;
        ctx = new Ctx();
        maitre = ctx.createGain();
        maitre.gain.value = sonOn ? 0.9 : 0;
        maitre.connect(ctx.destination);
        bufferBruit = fabriquerBruit(2);
        vagues = boucle('lowpass', 520);
        vent = boucle('bandpass', 380, 0.7);
        cascade = optionsAudio.cascade ? boucle('highpass', 1100) : null;
      }
      suspendu = false;
      if (ctx.state === 'suspended') ctx.resume();
    } catch (e) { /* pas de son, ce n'est pas grave */ }
  }

  function suspendre() {
    suspendu = true;
    try { if (ctx && ctx.state === 'running') ctx.suspend(); } catch (e) { /* tant pis */ }
  }

  function regler(actif) {
    sonOn = !!actif;
    try { if (maitre) maitre.gain.setTargetAtTime(sonOn ? 0.9 : 0, ctx.currentTime, 0.08); } catch (e) { /* tant pis */ }
  }

  function oiseau() {
    const t = ctx.currentTime;
    const n = 2 + Math.floor(Math.random() * 3);
    const base = 2200 + Math.random() * 1400;
    for (let i = 0; i < n; i++) {
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      const t0 = t + i * 0.13;
      o.type = 'sine';
      o.frequency.setValueAtTime(base, t0);
      o.frequency.exponentialRampToValueAtTime(base * 1.35, t0 + 0.07);
      g.gain.setValueAtTime(0.0001, t0);
      g.gain.exponentialRampToValueAtTime(0.045, t0 + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.1);
      o.connect(g);
      g.connect(maitre);
      o.start(t0);
      o.stop(t0 + 0.12);
    }
  }

  // e = { cote (0 à 1), altitude (0 à 1), dCascade (mètres) }
  function maj(dt, temps, e) {
    if (!ctx || suspendu) return;
    try {
      const t = ctx.currentTime;
      vagues.gain.setTargetAtTime((0.03 + 0.2 * e.cote) * (0.75 + 0.25 * Math.sin(temps * 0.9)), t, 0.3);
      vent.gain.setTargetAtTime(0.02 + 0.03 * e.altitude, t, 0.5);
      if (cascade) cascade.gain.setTargetAtTime(0.18 / (1 + Math.pow(e.dCascade / 6, 2)), t, 0.3);
      prochainOiseau -= dt;
      if (prochainOiseau <= 0) {
        prochainOiseau = 2.5 + Math.random() * 6;
        if (sonOn && e.cote < 0.6) oiseau();
      }
    } catch (err) { /* tant pis */ }
  }

  const REGLAGES_PAS = {
    sable: ['lowpass', 700, 0.10],
    herbe: ['bandpass', 520, 0.09],
    roche: ['highpass', 1300, 0.11],
    eau: ['bandpass', 950, 0.15],
    bois: ['lowpass', 1600, 0.13],
    atterrissage: ['lowpass', 500, 0.16]
  };

  function pas(sol, course) {
    if (!ctx || suspendu || !sonOn) return;
    try {
      const r = REGLAGES_PAS[sol] || REGLAGES_PAS.herbe;
      const src = ctx.createBufferSource();
      src.buffer = bufferBruit;
      const f = ctx.createBiquadFilter();
      f.type = r[0];
      f.frequency.value = r[1];
      const g = ctx.createGain();
      const t = ctx.currentTime;
      g.gain.setValueAtTime(r[2] * (course ? 1.3 : 1), t);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.11);
      src.connect(f);
      f.connect(g);
      g.connect(maitre);
      src.start(t, Math.random() * 1.5, 0.12);
    } catch (e) { /* tant pis */ }
  }

  function arreter() {
    try { if (ctx) ctx.close(); } catch (e) { /* tant pis */ }
    ctx = null;
  }

  return {
    demarrer: demarrer,
    suspendre: suspendre,
    regler: regler,
    maj: maj,
    pas: pas,
    arreter: arreter,
    etat: function () { return { actif: !!ctx, son: sonOn, suspendu: suspendu, rendu: ctx ? ctx.state : 'aucun' }; }
  };
}

export function creerSalle(conteneur, options) {
  options = options || {};
  const theme = THEMES[options.theme] || THEMES.enquete;
  const defs = options.stations || [];
  const n = defs.length;

  // ---------- Scène, caméra, rendu ----------
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(theme.ciel);
  scene.fog = new THREE.Fog(theme.brume, 14, 60);

  const camera = new THREE.PerspectiveCamera(70, 1, 0.1, 200);
  camera.rotation.order = 'YXZ';

  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  conteneur.appendChild(renderer.domElement);
  renderer.domElement.style.display = 'block';

  // ---------- L'île du mode (si elle existe), sinon la salle classique ----------
  let ile = null;
  try {
    ile = creerIle(THREE, options.theme, scene);
  } catch (e) {
    console.error('Île 3D impossible, retour à la salle classique :', e);
    while (scene.children.length > 0) scene.remove(scene.children[0]);
    ile = null;
  }
  if (ile) {
    scene.background = new THREE.Color(ile.ciel);
    scene.fog = new THREE.Fog(ile.brume[0], ile.brume[1], ile.brume[2]);
    camera.far = 450;
    camera.updateProjectionMatrix();
  }

  // ---------- Lumières ----------
  // Depuis Three.js r155, les lumières utilisent des unités physiques : il faut des valeurs plus fortes qu'avant.
  const lumHemi = ile ? ile.hemi : [theme.ciel, theme.sol, theme.lumiere * 2.5];
  scene.add(new THREE.HemisphereLight(lumHemi[0], lumHemi[1], lumHemi[2]));
  const soleil = new THREE.DirectionalLight(ile ? ile.soleil.couleur : 0xffffff, ile ? ile.soleil.intensite : (theme.lumiere + 0.3) * 2.5);
  const decSoleil = ile ? ile.soleil.decalage : [10, 22, 8];
  soleil.position.set(decSoleil[0], decSoleil[1], decSoleil[2]);
  soleil.castShadow = true;
  soleil.shadow.mapSize.set(2048, 2048);
  soleil.shadow.camera.left = -32;
  soleil.shadow.camera.right = 32;
  soleil.shadow.camera.top = 32;
  soleil.shadow.camera.bottom = -32;
  soleil.shadow.camera.near = 1;
  soleil.shadow.camera.far = ile ? 140 : 70;
  soleil.shadow.camera.updateProjectionMatrix();
  scene.add(soleil);
  scene.add(soleil.target);

  // ---------- Sol, grille, décor (salle classique) ----------
  if (!ile) {
    const sol = new THREE.Mesh(new THREE.CircleGeometry(60, 64), matiere(theme.sol));
    sol.rotation.x = -Math.PI / 2;
    sol.receiveShadow = true;
    scene.add(sol);

    const grille = new THREE.GridHelper(100, 50, 0xffffff, 0xffffff);
    grille.position.y = 0.02;
    grille.material.transparent = true;
    grille.material.opacity = 0.12;
    scene.add(grille);

    scene.add(fabriquerDecor(theme.decor));
  }

  // ---------- Stations (une par mission) ----------
  const rayonCercle = n <= 3 ? 9 : 12;
  const stations = defs.map(function (def, i) {
    const angle = (i / Math.max(n, 1)) * Math.PI * 2;
    let x = Math.sin(angle) * rayonCercle;
    let z = -Math.cos(angle) * rayonCercle;
    let nomLieu = '';
    let hauteurSol = 0;
    if (ile) {
      const lieu = ile.lieux[i % ile.lieux.length];
      x = lieu.x;
      z = lieu.z;
      nomLieu = lieu.nom;
      hauteurSol = ile.hauteur(x, z);
    }
    const libelleComplet = def.libelle + (nomLieu ? ' · ' + nomLieu : '');
    const groupe = new THREE.Group();
    groupe.position.x = x;
    groupe.position.y = hauteurSol;
    groupe.position.z = z;

    const socle = new THREE.Mesh(new THREE.CylinderGeometry(1, 1.2, 0.5, 24), matiere(0x333344));
    socle.position.y = 0.25;
    socle.castShadow = true;
    socle.receiveShadow = true;
    groupe.add(socle);
    if (ile) {
      const pied = new THREE.Mesh(new THREE.CylinderGeometry(1.25, 1.7, 1.6, 16), matiere(0x333344));
      pied.position.y = -0.6;
      groupe.add(pied);
    }

    const cristal = new THREE.Mesh(
      new THREE.OctahedronGeometry(0.6),
      new THREE.MeshStandardMaterial({ color: theme.accent, emissive: theme.accent, emissiveIntensity: 0.8, roughness: 0.3 })
    );
    cristal.position.y = 1.6;
    cristal.castShadow = true;
    groupe.add(cristal);

    const anneau = new THREE.Mesh(
      new THREE.RingGeometry(1.3, 1.6, 32),
      new THREE.MeshBasicMaterial({ color: theme.accent, side: THREE.DoubleSide })
    );
    anneau.rotation.x = -Math.PI / 2;
    anneau.position.y = 0.03;
    groupe.add(anneau);

    // sur l'île : pas de lumière par cristal (trop lourd), mais un faisceau visible de très loin
    const lumiere = ile ? { color: { set: function () {} } } : new THREE.PointLight(theme.accent, 25, 9);
    if (!ile) {
      lumiere.position.y = 2;
      groupe.add(lumiere);
    }
    let faisceau = null;
    if (ile) {
      faisceau = new THREE.Mesh(
        new THREE.CylinderGeometry(0.4, 0.4, 70, 10, 1, true),
        new THREE.MeshBasicMaterial({ color: theme.accent, transparent: true, opacity: 0.2, depthWrite: false, fog: false, side: THREE.DoubleSide })
      );
      faisceau.position.y = 35;
      groupe.add(faisceau);
    }

    const etiquette = new THREE.Sprite(new THREE.SpriteMaterial({ map: etiquetteTexture(libelleComplet, theme.accent), transparent: true }));
    etiquette.scale.set(3, 0.75, 1);
    etiquette.position.y = 3;
    groupe.add(etiquette);

    scene.add(groupe);

    const station = { index: i, x: x, z: z, libelle: libelleComplet, fait: false, cristal: cristal, anneau: anneau, lumiere: lumiere, etiquette: etiquette, faisceau: faisceau };
    if (def.fait) appliquerFait(station);
    return station;
  });

  function appliquerFait(s) {
    s.fait = true;
    s.cristal.material.color.set(COULEUR_FAIT);
    s.cristal.material.emissive.set(COULEUR_FAIT);
    s.anneau.material.color.set(COULEUR_FAIT);
    s.lumiere.color.set(COULEUR_FAIT);
    if (s.faisceau) s.faisceau.material.color.set(COULEUR_FAIT);
    const ancienne = s.etiquette.material.map;
    s.etiquette.material.map = etiquetteTexture('✓ ' + s.libelle, COULEUR_FAIT);
    s.etiquette.material.needsUpdate = true;
    if (ancienne && ancienne.dispose) ancienne.dispose();
  }

  // ---------- État du joueur ----------
  let x = 0;
  let z = 0;
  let cap = 0;          // tourner à gauche / droite
  let yCam = HAUTEUR_YEUX;
  if (ile) {
    x = ile.depart.x;
    z = ile.depart.z;
    cap = ile.depart.cap;
    yCam = ile.hauteur(x, z) + HAUTEUR_YEUX;
  }
  let inclinaison = 0;  // regarder en haut / en bas
  let verrouille = false;
  let actif = false;
  let proche = null;
  let boucle = null;
  let derniere = 0;
  const touches = { avant: false, arriere: false, gauche: false, droite: false, course: false, saut: false };
  let sautY = 0;          // hauteur du saut
  let sautV = 0;          // vitesse verticale
  let bobAmp = 0;         // intensité du balancement de la tête
  let distMarche = 0;     // distance marchée (pour le balancement et les pas)
  let pasRestant = 1.2;   // mètres avant le prochain bruit de pas
  let decalageY = 0;      // saut + balancement
  let qualite = 0;        // 0 = complète, 1 = allégée (ordinateur lent)
  let compteurImages = 0;

  function placerCamera() {
    camera.position.set(x, yCam + decalageY, z);
    camera.rotation.set(inclinaison, cap, 0);
  }

  // ---------- Taille ----------
  function redimensionner() {
    const largeur = Math.max(conteneur.clientWidth, 1);
    const hauteur = Math.max(conteneur.clientHeight, 1);
    renderer.setSize(largeur, hauteur);
    camera.aspect = largeur / hauteur;
    camera.updateProjectionMatrix();
  }

  // ---------- Clavier et souris ----------
  function reinitialiserTouches() {
    Object.keys(touches).forEach(function (k) { touches[k] = false; });
  }

  function appliquerTouche(e, bas) {
    const c = e.code;
    const k = (e.key || '').toLowerCase();
    let connue = true;
    if (c === 'KeyW' || c === 'ArrowUp' || k === 'z') touches.avant = bas;
    else if (c === 'KeyS' || c === 'ArrowDown') touches.arriere = bas;
    else if (c === 'KeyA' || c === 'ArrowLeft' || k === 'q') touches.gauche = bas;
    else if (c === 'KeyD' || c === 'ArrowRight') touches.droite = bas;
    else if (c === 'ShiftLeft' || c === 'ShiftRight') touches.course = bas;
    else if (c === 'Space') touches.saut = bas;
    else connue = false;
    return connue;
  }

  function surToucheBas(e) {
    if (!actif) return;
    if (e.code === 'KeyE') {
      if (!e.repeat) interagir();
      return;
    }
    if (e.code === 'Tab') {
      e.preventDefault();
      if (!e.repeat) basculerCarte();
      return;
    }
    if (appliquerTouche(e, true) && (e.code.indexOf('Arrow') === 0 || e.code === 'Space')) e.preventDefault();
  }

  function surToucheHaut(e) {
    if (!actif) return;
    appliquerTouche(e, false);
  }

  function surSouris(e) {
    if (!actif || !verrouille) return;
    cap -= (e.movementX || 0) * SENSIBILITE;
    inclinaison -= (e.movementY || 0) * SENSIBILITE;
    const limite = Math.PI / 2 - 0.05;
    inclinaison = Math.max(-limite, Math.min(limite, inclinaison));
    placerCamera();
  }

  function capturer() {
    if (ambiance) ambiance.demarrer();
    try {
      const r = renderer.domElement.requestPointerLock();
      if (r && typeof r.catch === 'function') r.catch(function () { /* l'élève a quitté trop vite */ });
    } catch (e) { /* pas grave */ }
  }

  function surChangementVerrou() {
    const ok = document.pointerLockElement === renderer.domElement;
    if (ok === verrouille) return;
    verrouille = ok;
    reinitialiserTouches();
    if (options.onVerrou) options.onVerrou(ok);
  }

  function surClic() {
    if (!actif) return;
    if (verrouille) interagir();
    else capturer();
  }

  function interagir() {
    if (proche !== null && options.onOuvrir) options.onOuvrir(proche);
  }

  // ---------- Mini-carte (coin de l'écran) et grande carte (touche Tab) ----------
  let carte = null;
  function creerCarte() {
    const PX = 220;
    const fond = document.createElement('canvas');
    fond.width = PX;
    fond.height = PX;
    ile.dessinerCarte(fond.getContext('2d'), PX);
    const c = document.createElement('canvas');
    c.width = PX;
    c.height = PX;
    c.setAttribute('aria-label', 'Mini-carte de l’île (touche Tab pour l’agrandir)');
    if (window.getComputedStyle(conteneur).position === 'static') conteneur.style.position = 'relative';
    const st = c.style;
    st.position = 'absolute';
    st.zIndex = '5';
    st.pointerEvents = 'none';
    st.border = '2px solid rgba(255,255,255,0.55)';
    st.borderRadius = '14px';
    st.boxShadow = '0 6px 20px rgba(0,0,0,0.45)';
    conteneur.appendChild(c);
    const obj = { canvas: c, ctx: c.getContext('2d'), fond: fond, px: PX, grande: false };
    return obj;
  }
  function styleCarte() {
    const st = carte.canvas.style;
    if (carte.grande) {
      st.left = '50%'; st.bottom = '50%'; st.transform = 'translate(-50%, 50%)';
      st.width = 'min(70vh, 90vw)'; st.height = 'min(70vh, 90vw)';
    } else {
      st.left = '14px'; st.bottom = '14px'; st.transform = 'none';
      st.width = '170px'; st.height = '170px';
    }
  }
  function basculerCarte() {
    if (!carte) return;
    carte.grande = !carte.grande;
    styleCarte();
    dessinerCarteHud();
  }
  function dessinerCarteHud() {
    if (!carte) return;
    const g = carte.ctx;
    const P = carte.px;
    const T = ile.taille;
    g.clearRect(0, 0, P, P);
    g.drawImage(carte.fond, 0, 0);
    stations.forEach(function (s) {
      const px = (s.x / T + 0.5) * P;
      const py = (s.z / T + 0.5) * P;
      g.beginPath();
      g.arc(px, py, 8, 0, 6.2832);
      g.fillStyle = s.fait ? '#4cd964' : '#ffd166';
      g.fill();
      g.lineWidth = 2;
      g.strokeStyle = '#14102b';
      g.stroke();
      g.fillStyle = '#14102b';
      g.font = 'bold 11px Arial, sans-serif';
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.fillText(String(s.index + 1), px, py + 0.5);
    });
    g.save();
    g.translate((x / T + 0.5) * P, (z / T + 0.5) * P);
    g.rotate(-cap);
    g.beginPath();
    g.moveTo(0, -10);
    g.lineTo(7, 8);
    g.lineTo(0, 3);
    g.lineTo(-7, 8);
    g.closePath();
    g.fillStyle = '#ffffff';
    g.fill();
    g.lineWidth = 2;
    g.strokeStyle = '#e63946';
    g.stroke();
    g.restore();
    g.fillStyle = '#ffffff';
    g.font = 'bold 15px Arial, sans-serif';
    g.textAlign = 'center';
    g.textBaseline = 'top';
    g.fillText('N', P / 2, 3);
  }
  if (ile && ile.dessinerCarte && typeof document !== 'undefined') {
    try {
      carte = creerCarte();
      styleCarte();
    } catch (e) {
      console.error('Mini-carte impossible :', e);
      carte = null;
    }
  }
  const ambiance = ile ? creerAmbiance({ son: options.son !== false, cascade: ile.ambiance && ile.ambiance.cascade }) : null;

  // ---------- Boucle d'animation ----------
  function chercherProche() {
    let meilleur = null;
    let dMin = DISTANCE_OUVERTURE;
    stations.forEach(function (s) {
      if (s.fait) return;
      const d = Math.hypot(s.x - x, s.z - z);
      if (d < dMin) { dMin = d; meilleur = s.index; }
    });
    if (meilleur !== proche) {
      proche = meilleur;
      if (options.onProche) options.onProche(proche);
    }
  }

  // sur l'île : on ne marche pas dans l'eau, on ne traverse pas les obstacles, on ne grimpe pas les falaises
  function peutAller(nx, nz) {
    if (!ile.libre(nx, nz, 0.4)) return false;
    const d = Math.hypot(nx - x, nz - z);
    if (d < 0.0001) return true;
    return (ile.hauteur(nx, nz) - ile.hauteur(x, z)) / d <= 1.1;
  }

  function deplacer(avance, lateral, course, dt) {
    const longueur = Math.hypot(avance, lateral);
    if (longueur === 0) return 0;
    const x0 = x;
    const z0 = z;
    const vitesse = VITESSE * (course ? COEF_COURSE : 1);
    const sinC = Math.sin(cap);
    const cosC = Math.cos(cap);
    const dx = ((lateral * cosC - avance * sinC) / longueur) * vitesse * dt;
    const dz = ((-lateral * sinC - avance * cosC) / longueur) * vitesse * dt;
    if (ile) {
      // on glisse le long des obstacles, mais on ne va ni dans l'eau ni sur une falaise
      const p = ile.pousser(x + dx, z + dz, 0.4);
      if (peutAller(p[0], p[1])) { x = p[0]; z = p[1]; }
      else if (peutAller(x + dx, z)) { x += dx; }
      else if (peutAller(x, z + dz)) { z += dz; }
    } else {
      x += dx;
      z += dz;
      // on reste dans la salle
      const dist = Math.hypot(x, z);
      if (dist > RAYON_SALLE) { x = (x / dist) * RAYON_SALLE; z = (z / dist) * RAYON_SALLE; }
    }
    // on ne traverse pas les socles
    stations.forEach(function (s) {
      const ddx = x - s.x;
      const ddz = z - s.z;
      const d = Math.hypot(ddx, ddz);
      if (d < 1.5 && d > 0.0001) { x = s.x + (ddx / d) * 1.5; z = s.z + (ddz / d) * 1.5; }
    });
    placerCamera();
    return Math.hypot(x - x0, z - z0);
  }

  // le balancement de la tête et le bruit des pas
  function suiviMarche(bouge, dt, course) {
    distMarche += bouge;
    bobAmp += ((bouge > 0.0005 && sautY === 0 ? 1 : 0) - bobAmp) * Math.min(1, dt * 8);
    decalageY = sautY + Math.sin(distMarche * 2.4) * 0.045 * bobAmp;
    if (bouge > 0 && sautY === 0) {
      pasRestant -= bouge;
      if (pasRestant <= 0) {
        pasRestant = course ? 1.5 : 2.0;
        if (ambiance) ambiance.pas(ile && ile.typeSol ? ile.typeSol(x, z) : 'herbe', course);
      }
    }
  }

  function mettreAJour(dt, temps) {
    let bouge = 0;
    if (verrouille) {
      const avance = (touches.avant ? 1 : 0) - (touches.arriere ? 1 : 0);
      const lateral = (touches.droite ? 1 : 0) - (touches.gauche ? 1 : 0);
      bouge = deplacer(avance, lateral, touches.course, dt);
      if (touches.saut && sautY === 0 && sautV === 0) sautV = 6.2;
    }
    // le saut
    if (sautV !== 0 || sautY > 0) {
      sautV -= 20 * dt;
      sautY += sautV * dt;
      if (sautY <= 0) {
        sautY = 0;
        sautV = 0;
        if (ambiance) ambiance.pas('atterrissage', false);
      }
    }
    suiviMarche(bouge, dt, touches.course);
    if (ile) {
      const hSol = ile.hauteur(x, z);
      yCam += (hSol + HAUTEUR_YEUX - yCam) * Math.min(1, dt * 10);
      ile.maj(dt, temps, { x: x, y: yCam, z: z });
      soleil.position.set(x + decSoleil[0], yCam + decSoleil[1], z + decSoleil[2]);
      soleil.target.position.set(x, yCam - HAUTEUR_YEUX, z);
      if (ambiance) {
        ambiance.maj(dt, temps, {
          cote: Math.max(0, Math.min(1, 1 - (hSol - 0.3) / 6)),
          altitude: Math.max(0, Math.min(1, hSol / 18)),
          dCascade: ile.ambiance && ile.ambiance.cascade ? Math.hypot(x - ile.ambiance.cascade.x, z - ile.ambiance.cascade.z) : 999
        });
      }
    }
    placerCamera();
    stations.forEach(function (s) {
      s.cristal.rotation.y += dt * (s.fait ? 0.3 : 1.4);
      s.cristal.position.y = 1.6 + Math.sin(temps * 2 + s.index) * 0.12;
    });
    chercherProche();
  }

  // si l'ordinateur est lent, on allège automatiquement (pas d'ombres, définition normale)
  let cumulDt = 0;
  let nbMesures = 0;
  let imagesVues = 0;
  function baisserQualite() {
    if (qualite === 1) return;
    qualite = 1;
    renderer.setPixelRatio(1);
    soleil.castShadow = false;
    redimensionner();
  }

  function image(maintenant) {
    boucle = requestAnimationFrame(image);
    const dtBrut = Math.min((maintenant - derniere) / 1000, 0.2);
    const dt = Math.min(dtBrut, 0.05);
    derniere = maintenant;
    try {
      mettreAJour(dt, maintenant / 1000);
      renderer.render(scene, camera);
      compteurImages++;
      if (carte && compteurImages % 3 === 0) dessinerCarteHud();
      if (qualite === 0) {
        imagesVues++;
        if (imagesVues > 40 && imagesVues <= 160) { cumulDt += dtBrut; nbMesures++; }
        if (imagesVues === 160 && cumulDt / nbMesures > 0.045) baisserQualite();
      }
    } catch (e) {
      arreterBoucle();
      if (options.onErreur) options.onErreur(e);
    }
  }

  function arreterBoucle() {
    if (boucle !== null) { cancelAnimationFrame(boucle); boucle = null; }
  }

  // ---------- Branchements ----------
  window.addEventListener('resize', redimensionner);
  document.addEventListener('keydown', surToucheBas);
  document.addEventListener('keyup', surToucheHaut);
  document.addEventListener('mousemove', surSouris);
  document.addEventListener('pointerlockchange', surChangementVerrou);
  renderer.domElement.addEventListener('click', surClic);

  placerCamera();
  redimensionner();

  // ---------- Ce que la page peut utiliser ----------
  return {
    demarrer: function () {
      redimensionner();
      if (ambiance) ambiance.demarrer();
      if (carte) dessinerCarteHud();
      actif = true;
      derniere = performance.now();
      arreterBoucle();
      boucle = requestAnimationFrame(image);
    },
    reprendre: function () { this.demarrer(); },
    pause: function () {
      if (ambiance) ambiance.suspendre();
      actif = false;
      arreterBoucle();
      verrouille = false;
      reinitialiserTouches();
      try { document.exitPointerLock(); } catch (e) { /* pas grave */ }
    },
    capturer: capturer,
    marquerFaite: function (i) {
      const s = stations[i];
      if (s && !s.fait) appliquerFait(s);
      chercherProche();
    },
    placer: function (px, pz, nouveauCap) {   // utile pour les tests
      x = px; z = pz;
      if (typeof nouveauCap === 'number') cap = nouveauCap;
      if (ile) yCam = ile.hauteur(x, z) + HAUTEUR_YEUX;
      placerCamera();
      chercherProche();
    },
    marcher: function (avance, lateral, course, dt) {   // utile pour les tests
      suiviMarche(deplacer(avance, lateral, course, dt), dt, course);
      if (ile) yCam = ile.hauteur(x, z) + HAUTEUR_YEUX;
      placerCamera();
      chercherProche();
    },
    stationsPos: function () {
      return stations.map(function (st) { return { x: st.x, z: st.z, libelle: st.libelle, faisceau: !!st.faisceau }; });
    },
    ile: function () { return ile ? ile.nom : null; },
    reglerSon: function (actifSon) { if (ambiance) ambiance.regler(actifSon); },
    qualite: function () { return qualite; },
    baisserQualite: baisserQualite,
    carte: function () { return carte ? { px: carte.px, grande: carte.grande } : null; },
    basculerCarte: basculerCarte,
    ambianceEtat: function () { return ambiance ? ambiance.etat() : null; },
    sauter: function () { if (sautY === 0 && sautV === 0) sautV = 6.2; },
    hauteurSaut: function () { return sautY; },
    etat: function () {
      return { x: x, z: z, cap: cap, inclinaison: inclinaison, proche: proche, verrouille: verrouille, actif: actif };
    },
    detruire: function () {
      this.pause();
      if (ambiance) ambiance.arreter();
      if (carte && carte.canvas.parentNode) carte.canvas.parentNode.removeChild(carte.canvas);
      window.removeEventListener('resize', redimensionner);
      document.removeEventListener('keydown', surToucheBas);
      document.removeEventListener('keyup', surToucheHaut);
      document.removeEventListener('mousemove', surSouris);
      document.removeEventListener('pointerlockchange', surChangementVerrou);
      renderer.domElement.removeEventListener('click', surClic);
      scene.traverse(function (o) {
        if (o.geometry && o.geometry.dispose) o.geometry.dispose();
        const mats = o.material ? (Array.isArray(o.material) ? o.material : [o.material]) : [];
        mats.forEach(function (m) {
          if (m.map && m.map.dispose) m.map.dispose();
          if (m.dispose) m.dispose();
        });
      });
      renderer.dispose();
      if (renderer.domElement.parentNode) renderer.domElement.parentNode.removeChild(renderer.domElement);
    }
  };
}
