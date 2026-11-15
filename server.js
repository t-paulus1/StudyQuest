const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });
const express = require('express');
const fs = require('fs');

const app = express();
const port = 3000;
app.use(express.json({ limit: '200kb' }));

const apiKey = process.env.NVIDIA_API_KEY;
const model = process.env.NVIDIA_MODEL || 'nvidia/nemotron-3-ultra-550b-a55b';
const API_URL = process.env.NVIDIA_API_URL || 'https://integrate.api.nvidia.com/v1/chat/completions';

// ---------- Les 4 ambiances de jeu ----------
const AMBIANCES = {
  enquete: "Le joueur est un détective. Chaque mission est une étape d'une enquête : le scénario présente un indice, un témoin ou un document, et la question demande d'utiliser le cours pour avancer vers la solution.",
  aventure: "Le joueur est le héros d'une aventure. Chaque mission est une étape d'un voyage : le scénario présente un lieu ou un personnage qui parle au joueur, et la question demande d'utiliser le cours pour passer l'obstacle.",
  survie: "Le joueur doit survivre dans une situation dangereuse. Chaque mission est un événement urgent : le scénario décrit le danger, et la bonne décision demande de connaître le cours.",
  strategie: "Le joueur dirige une ville, une équipe ou un projet. Chaque mission est une décision à prendre : le scénario décrit la situation, et la bonne décision demande de connaître le cours."
};

const NIVEAUX = {
  college: "collège (très simple : phrases courtes, mots faciles, questions directes)",
  lycee: "lycée (difficulté intermédiaire)",
  superieur: "études supérieures (précis et exigeant, avec le vocabulaire technique du cours)"
};

function consignes(mode, nb, niveau, focus) {
  let supplement = '';
  if (focus.length > 0) {
    supplement = `
- L'élève a raté ces points : ${focus.map((f) => '"' + f + '"').join(' ; ')}. Fabrique des questions NOUVELLES, formulées autrement, qui testent précisément ces points. Reste toujours basé uniquement sur le cours.`;
  }
  return `Tu es le créateur de jeux éducatifs de StudyQuest.
On te donne le cours d'un élève. Tu fabriques un petit jeu à partir de ce cours.

Règles :
- Appuie-toi UNIQUEMENT sur le cours fourni. N'invente aucune information qui n'y est pas.
- Écris en français simple, adapté à un élève.
- Ambiance du jeu : ${AMBIANCES[mode]}
- Niveau de l'élève : ${NIVEAUX[niveau]}.
- Fabrique exactement ${nb} missions.${supplement}
- Chaque mission a exactement 4 choix, dont un seul est correct. Les mauvais choix doivent sembler plausibles.
- Réponds UNIQUEMENT avec du JSON valide, sans aucun texte avant ou après, sans balises de code.

Le JSON doit avoir exactement cette forme :
{
  "titre": "titre du jeu",
  "intro": "2 ou 3 phrases qui lancent l'histoire",
  "missions": [
    {
      "scenario": "la situation du joueur (2 à 3 phrases)",
      "question": "la question liée au cours",
      "choix": ["réponse A", "réponse B", "réponse C", "réponse D"],
      "bonne_reponse": 0,
      "indice": "un petit indice qui ne donne pas la réponse",
      "explication": "pourquoi c'est la bonne réponse, avec le lien vers le cours"
    }
  ],
  "notions": ["notion 1", "notion 2", "notion 3"]
}
(bonne_reponse est la position de la bonne réponse dans la liste : 0, 1, 2 ou 3.)`;
}

// ---------- Appel à NVIDIA ----------
function envoyer(corps) {
  return fetch(API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`
    },
    body: JSON.stringify(corps),
    signal: AbortSignal.timeout(120000)
  });
}

async function appelerNvidia(messages, maxTokens) {
  const base = { model: model, messages: messages, max_tokens: maxTokens, temperature: 0.7 };
  // On demande à l'IA de ne pas "réfléchir longuement" : c'est plus rapide.
  let rep = await envoyer({ ...base, chat_template_kwargs: { enable_thinking: false } });
  if (rep.status === 400) {
    rep = await envoyer(base); // au cas où ce réglage n'est pas accepté
  }
  const data = await rep.json().catch(() => null);
  if (!rep.ok) {
    const err = new Error('NVIDIA a répondu avec une erreur (code ' + rep.status + ').');
    err.status = rep.status;
    err.details = data;
    throw err;
  }
  const texte = data && data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content;
  if (!texte) throw new Error("L'IA n'a renvoyé aucun texte.");
  return texte;
}

// ---------- Lire et vérifier la réponse de l'IA ----------
function extraireJson(texte) {
  let t = texte.trim();
  t = t.replace(/^```(?:json)?/i, '').replace(/```$/, '').trim();
  const debut = t.indexOf('{');
  const fin = t.lastIndexOf('}');
  if (debut === -1 || fin === -1) throw new Error('Pas de JSON dans la réponse.');
  return JSON.parse(t.slice(debut, fin + 1));
}

function estTexte(v) {
  return typeof v === 'string' && v.trim().length > 0;
}

function nettoyer(obj, nb) {
  if (!obj || !estTexte(obj.titre) || !estTexte(obj.intro) || !Array.isArray(obj.missions)) {
    throw new Error('Format invalide.');
  }
  const missions = obj.missions.slice(0, nb).map((m) => {
    if (!m || !estTexte(m.scenario) || !estTexte(m.question) || !estTexte(m.indice) || !estTexte(m.explication)) {
      throw new Error('Mission invalide.');
    }
    if (!Array.isArray(m.choix) || m.choix.length !== 4 || !m.choix.every(estTexte)) {
      throw new Error('Choix invalides.');
    }
    const differents = new Set(m.choix.map((c) => c.trim().toLowerCase()));
    if (differents.size !== 4) {
      throw new Error('Choix en double.');
    }
    const bonne = Number(m.bonne_reponse);
    if (!Number.isInteger(bonne) || bonne < 0 || bonne > 3) {
      throw new Error('Bonne réponse invalide.');
    }
    // On mélange les choix pour que la bonne réponse change de place.
    const items = m.choix.map((c, i) => ({ texte: c, ok: i === bonne }));
    for (let i = items.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      const tmp = items[i]; items[i] = items[j]; items[j] = tmp;
    }
    return {
      scenario: m.scenario,
      question: m.question,
      choix: items.map((x) => x.texte),
      bonne_reponse: items.findIndex((x) => x.ok),
      indice: m.indice,
      explication: m.explication
    };
  });
  const vues = new Set();
  const sansDoublon = missions.filter((m) => {
    const cle = m.question.trim().toLowerCase();
    if (vues.has(cle)) return false;
    vues.add(cle);
    return true;
  });
  if (sansDoublon.length < Math.min(nb, 3)) throw new Error('Pas assez de missions.');
  const notions = Array.isArray(obj.notions) ? obj.notions.filter(estTexte).slice(0, 6) : [];
  return { titre: obj.titre, intro: obj.intro, missions: sansDoublon, notions: notions };
}

// ---------- Limite : 15 générations par minute et par adresse IP ----------
const appels = new Map();

function limiteAtteinte(ip) {
  const maintenant = Date.now();
  const recents = (appels.get(ip) || []).filter((t) => maintenant - t < 60000);
  if (recents.length >= 15) {
    appels.set(ip, recents);
    return true;
  }
  recents.push(maintenant);
  appels.set(ip, recents);
  return false;
}

// ---------- Journal : une ligne par génération (jamais le cours, jamais la clé) ----------
function journal(mode, nb, niveau, focus, debut, ok) {
  const heure = new Date().toLocaleTimeString('fr-FR');
  console.log('[' + heure + '] generation mode=' + mode + ' nb=' + nb + ' niveau=' + niveau +
    (focus.length > 0 ? ' revision' : '') + ' ' + (Date.now() - debut) + ' ms ' + (ok ? 'OK' : 'ECHEC'));
}

// ---------- Les pages et les routes ----------
app.get('/', (req, res) => {
  res.sendFile('index.html', { root: __dirname });
});

// ---------- La 3D (Three.js) ----------
// Le module 3D de StudyQuest, et la bibliothèque Three.js installée par « npm install ».
const dossierThree = path.join(__dirname, 'node_modules', 'three', 'build');
app.get('/salle3d.js', (req, res) => {
  res.sendFile('salle3d.js', { root: __dirname });
});

app.get('/iles3d.js', (req, res) => {
  res.sendFile('iles3d.js', { root: __dirname });
});
app.use('/vendor/three', express.static(dossierThree));

app.get('/api/sante', (req, res) => {
  res.json({ ok: true, modele: model, cleTrouvee: Boolean(apiKey) });
});

app.get('/api/test', async (req, res) => {
  if (!apiKey) {
    return res.status(500).json({ error: 'Clé API NVIDIA manquante dans le fichier .env' });
  }
  try {
    const texte = await appelerNvidia(
      [{ role: 'user', content: "Dis-moi une très courte blague sur l'informatique." }],
      300
    );
    res.json({ modele: model, reponse: texte });
  } catch (error) {
    console.error('Erreur API NVIDIA :', error.message);
    res.status(500).json({ error: error.message, details: error.details });
  }
});

app.post('/api/generer', async (req, res) => {
  if (!apiKey) {
    return res.status(500).json({ error: 'La clé API NVIDIA est introuvable dans le fichier .env.' });
  }
  if (limiteAtteinte(req.ip)) {
    return res.status(429).json({ error: 'Doucement ! Réessaie dans une minute.' });
  }
  const debut = Date.now();
  const body = req.body || {};
  const mode = AMBIANCES[body.mode] ? body.mode : 'enquete';
  let cours = typeof body.cours === 'string' ? body.cours.trim() : '';
  if (cours.length < 200) {
    return res.status(400).json({ error: 'Le cours est trop court : colle au moins 200 caractères.' });
  }
  cours = cours.slice(0, 6000);
  const nb = Number(body.nb) === 5 ? 5 : 3;
  const niveau = NIVEAUX[body.niveau] ? body.niveau : 'lycee';
  const focus = Array.isArray(body.focus)
    ? body.focus.filter((f) => typeof f === 'string' && f.trim().length > 0).slice(0, 5).map((f) => f.trim().slice(0, 200))
    : [];

  const messages = [
    { role: 'system', content: consignes(mode, nb, niveau, focus) },
    { role: 'user', content: 'Voici le cours :\n\n' + cours }
  ];

  let derniere = null;
  for (let essai = 1; essai <= 2; essai++) {
    try {
      const texte = await appelerNvidia(messages, nb === 5 ? 4500 : 3000);
      const jeu = nettoyer(extraireJson(texte), nb);
      journal(mode, nb, niveau, focus, debut, true);
      return res.json(jeu);
    } catch (e) {
      derniere = e;
      console.error('Essai ' + essai + ' échoué :', e.message);
      if (e.status === 401 || e.status === 403 || e.status === 429) break; // inutile de réessayer
    }
  }

  journal(mode, nb, niveau, focus, debut, false);
  let message = "L'IA n'a pas réussi à préparer le jeu. Réessaie dans un instant.";
  if (derniere && (derniere.status === 401 || derniere.status === 403)) {
    message = 'NVIDIA refuse la clé API. Vérifie ta clé dans le fichier .env, puis relance le serveur.';
  } else if (derniere && derniere.status === 429) {
    message = "Trop de demandes envoyées à NVIDIA. Attends une minute puis réessaie.";
  } else if (derniere && derniere.name === 'TimeoutError') {
    message = "L'IA a mis trop de temps à répondre. Réessaie, ou choisis un modèle plus rapide dans le fichier .env.";
  }
  res.status(502).json({ error: message });
});

app.use((err, req, res, next) => {
  res.status(400).json({ error: 'Requête invalide.' });
});

const server = app.listen(port, () => {
  console.log('Serveur StudyQuest en cours sur http://localhost:' + port);
  console.log('Clé trouvée : ' + (apiKey ? 'oui' : 'non'));
  console.log('Modèle : ' + model);
  console.log('3D (Three.js) : ' + (fs.existsSync(dossierThree) ? 'installée' : "absente (tape « npm install » pour l'activer)"));
});

server.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    console.error('STOP : le port 3000 est déjà utilisé. Un ancien serveur tourne encore. Ferme-le, puis relance.');
  } else {
    console.error('Erreur au démarrage :', err);
  }
});
