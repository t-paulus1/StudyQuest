// Fabrique le jeu avec NVIDIA Nemotron. « -background » dans le nom = Netlify la laisse
// travailler longtemps (jusqu'à 15 minutes) et répond tout de suite « 202 ».
// Le résultat est rangé dans un petit stockage (Netlify Blobs), puis lu par resultat.mjs.
import { getStore } from '@netlify/blobs';

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

function consignes(mode, nb, niveau, focus, langue) {
  const nomLangue = { en: 'English', fr: 'French', es: 'Spanish' }[langue] || 'English';
  let supplement = '';
  if (focus.length > 0) {
    supplement = `
- L'élève a raté ces points : ${focus.map((f) => '"' + f + '"').join(' ; ')}. Fabrique des questions NOUVELLES, formulées autrement, qui testent précisément ces points. Reste toujours basé uniquement sur le cours.`;
  }
  return `Tu es le créateur de jeux éducatifs de StudyQuest.
On te donne le cours d'un élève. Tu fabriques un petit jeu à partir de ce cours.

Règles :
- Appuie-toi UNIQUEMENT sur le cours fourni. N'invente aucune information qui n'y est pas.
- Écris toute la réponse en ${nomLangue}, avec des formulations simples adaptées à un élève. Traduis le titre, l'introduction, les scénarios, les questions, les choix, les indices, les explications et les notions.
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
  const url = process.env.NVIDIA_API_URL || 'https://integrate.api.nvidia.com/v1/chat/completions';
  return fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${process.env.NVIDIA_API_KEY}`
    },
    body: JSON.stringify(corps),
    signal: AbortSignal.timeout(120000)
  });
}

async function appelerNvidia(messages, maxTokens) {
  const modele = process.env.NVIDIA_MODEL || 'nvidia/nemotron-3-ultra-550b-a55b';
  const base = { model: modele, messages: messages, max_tokens: maxTokens, temperature: 0.7 };
  let rep = await envoyer({ ...base, chat_template_kwargs: { enable_thinking: false } });
  if (rep.status === 400) {
    rep = await envoyer(base);
  }
  const data = await rep.json().catch(() => null);
  if (!rep.ok) {
    const err = new Error('NVIDIA a répondu avec une erreur (code ' + rep.status + ').');
    err.status = rep.status;
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

// ---------- La fonction ----------
export default async (req) => {
  let body = {};
  try { body = await req.json(); } catch (e) { return; }
  const id = typeof body.id === 'string' && /^[a-z0-9]{8,40}$/i.test(body.id) ? body.id : null;
  if (!id) return;

  const store = getStore('jeux');
  const echec = (message) => store.setJSON(id, { statut: 'erreur', error: message });

  try {
    const langue = ['en','fr','es'].includes(body.langue) ? body.langue : 'en';
    const erreurs = {
      en: { key: 'The NVIDIA API key is missing from Netlify environment variables.', short: 'Your lesson is too short. Paste at least 200 characters.', failed: 'AI could not prepare the game. Please try again shortly.', auth: 'NVIDIA rejected the API key. Check the key in Netlify settings.', rate: 'Too many requests were sent to NVIDIA. Wait a minute, then try again.', timeout: 'AI took too long to respond. Please try again.', general: 'Something went wrong. Please try again shortly.' },
      fr: { key: "La clé API NVIDIA est introuvable dans les variables d'environnement de Netlify.", short: 'Le cours est trop court : colle au moins 200 caractères.', failed: "L'IA n'a pas réussi à préparer le jeu. Réessaie dans un instant.", auth: 'NVIDIA refuse la clé API. Vérifie ta clé dans les variables de Netlify.', rate: 'Trop de demandes envoyées à NVIDIA. Attends une minute puis réessaie.', timeout: "L'IA a mis trop de temps à répondre. Réessaie.", general: 'Une erreur est survenue. Réessaie dans un instant.' },
      es: { key: 'Falta la clave API de NVIDIA en las variables de entorno de Netlify.', short: 'La lección es demasiado corta. Pega al menos 200 caracteres.', failed: 'La IA no pudo preparar el juego. Inténtalo de nuevo en breve.', auth: 'NVIDIA rechazó la clave API. Comprueba la clave en Netlify.', rate: 'Se enviaron demasiadas solicitudes a NVIDIA. Espera un minuto e inténtalo de nuevo.', timeout: 'La IA tardó demasiado en responder. Inténtalo de nuevo.', general: 'Se produjo un error. Inténtalo de nuevo en breve.' }
    }[langue];
    if (!process.env.NVIDIA_API_KEY) {
      return await echec(erreurs.key);
    }
    const mode = AMBIANCES[body.mode] ? body.mode : 'enquete';
    let cours = typeof body.cours === 'string' ? body.cours.trim() : '';
    if (cours.length < 200) {
      return await echec(erreurs.short);
    }
    cours = cours.slice(0, 6000);
    const nb = Number(body.nb) === 5 ? 5 : 3;
    const niveau = NIVEAUX[body.niveau] ? body.niveau : 'lycee';
    const focus = Array.isArray(body.focus)
      ? body.focus.filter((f) => typeof f === 'string' && f.trim().length > 0).slice(0, 5).map((f) => f.trim().slice(0, 200))
      : [];

    const messages = [
      { role: 'system', content: consignes(mode, nb, niveau, focus, langue) },
      { role: 'user', content: 'Voici le cours :\n\n' + cours }
    ];

    let derniere = null;
    for (let essai = 1; essai <= 2; essai++) {
      try {
        const texte = await appelerNvidia(messages, nb === 5 ? 4500 : 3000);
        const jeu = nettoyer(extraireJson(texte), nb);
        return await store.setJSON(id, { statut: 'ok', jeu: jeu });
      } catch (e) {
        derniere = e;
        console.error('Essai ' + essai + ' échoué :', e.message);
        if (e.status === 401 || e.status === 403 || e.status === 429) break;
      }
    }

    let message = erreurs.failed;
    if (derniere && (derniere.status === 401 || derniere.status === 403)) {
      message = erreurs.auth;
    } else if (derniere && derniere.status === 429) {
      message = erreurs.rate;
    } else if (derniere && derniere.name === 'TimeoutError') {
      message = erreurs.timeout;
    }
    await echec(message);
  } catch (e) {
    console.error('Erreur générale :', e);
    const fallback = body.langue === 'fr' ? 'Une erreur est survenue. Réessaie dans un instant.' : body.langue === 'es' ? 'Se produjo un error. Inténtalo de nuevo en breve.' : 'Something went wrong. Please try again shortly.';
    try { await echec(fallback); } catch (e2) { /* tant pis */ }
  }
};
