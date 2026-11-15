// Test de qualité : envoie 3 petits cours dans les 4 modes à /api/generer.
// Mode d'emploi : lance d'abord le serveur (node server.js), puis, dans un AUTRE terminal :
//   node test-generation.js
// Le résultat est affiché dans le terminal et enregistré dans resultats-tests.json (sans aucune clé).

const fs = require('fs');

const URL_BASE = process.env.STUDYQUEST_URL || 'http://localhost:3000';
const PAUSE_MS = Number(process.env.STUDYQUEST_PAUSE_MS || 5000); // pause entre deux appels (la limite est de 15 par minute)

const COURS = [
  {
    matiere: 'Histoire',
    texte: "La Révolution française commence en 1789. Le 14 juillet 1789, le peuple de Paris prend la Bastille, une prison qui symbolise le pouvoir du roi. En août, l'Assemblée adopte la Déclaration des droits de l'homme et du citoyen, qui affirme que les hommes naissent libres et égaux en droits. En 1792, la monarchie est abolie et la Première République est proclamée."
  },
  {
    matiere: 'Maths',
    texte: "Le théorème de Pythagore s'applique aux triangles rectangles. Dans un triangle rectangle, le côté le plus long, appelé hypoténuse, est le côté opposé à l'angle droit. Le théorème dit que le carré de l'hypoténuse est égal à la somme des carrés des deux autres côtés. Par exemple, si les côtés de l'angle droit mesurent 3 et 4, l'hypoténuse mesure 5, car 9 plus 16 égale 25."
  },
  {
    matiere: 'Anglais',
    texte: "Le present perfect est un temps de l'anglais. Il se forme avec l'auxiliaire have ou has, suivi du participe passé du verbe. On l'utilise pour parler d'une action passée qui a un lien avec le présent, par exemple I have lost my keys. On l'utilise aussi avec ever et never pour parler d'une expérience, et avec for et since pour parler de la durée d'une action qui continue."
  }
];

const MODES = ['enquete', 'aventure', 'survie', 'strategie'];
const NB = 3;

function attendre(ms) {
  return new Promise((ok) => setTimeout(ok, ms));
}

function texteOk(v) {
  return typeof v === 'string' && v.trim().length > 0;
}

// Renvoie la liste des problèmes trouvés (liste vide = tout est bon)
function verifier(jeu) {
  const problemes = [];
  if (!jeu || typeof jeu !== 'object') return ['réponse vide'];
  if (!texteOk(jeu.titre)) problemes.push('titre vide');
  if (!texteOk(jeu.intro)) problemes.push('intro vide');
  if (!Array.isArray(jeu.missions) || jeu.missions.length !== NB) {
    problemes.push('il faut ' + NB + ' missions');
    return problemes;
  }
  jeu.missions.forEach((m, i) => {
    const nom = 'mission ' + (i + 1);
    if (!texteOk(m.scenario) || !texteOk(m.question) || !texteOk(m.indice) || !texteOk(m.explication)) {
      problemes.push(nom + ' : un champ est vide');
    }
    if (!Array.isArray(m.choix) || m.choix.length !== 4 || !m.choix.every(texteOk)) {
      problemes.push(nom + ' : il faut 4 choix');
    }
    if (!Number.isInteger(m.bonne_reponse) || m.bonne_reponse < 0 || m.bonne_reponse > 3) {
      problemes.push(nom + ' : bonne_reponse invalide');
    }
  });
  return problemes;
}

async function main() {
  try {
    const rep = await fetch(URL_BASE + '/api/sante');
    const sante = await rep.json();
    console.log('Serveur trouvé. Modèle : ' + sante.modele + ' | clé trouvée : ' + (sante.cleTrouvee ? 'oui' : 'NON'));
  } catch (e) {
    console.log("❌ Le serveur ne répond pas. Lance d'abord « node server.js » dans un autre terminal.");
    process.exit(1);
  }

  const total = COURS.length * MODES.length;
  console.log('Test de ' + total + ' générations (pause de ' + PAUSE_MS / 1000 + ' s entre chaque)...\n');

  const resultats = [];
  let numero = 0;
  for (const cours of COURS) {
    for (const mode of MODES) {
      if (numero > 0) await attendre(PAUSE_MS);
      numero++;
      const debut = Date.now();
      let ok = false;
      let probleme = '';
      let jeu = null;
      try {
        const rep = await fetch(URL_BASE + '/api/generer', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ cours: cours.texte, mode: mode, nb: NB, niveau: 'lycee' }),
          signal: AbortSignal.timeout(180000)
        });
        const data = await rep.json().catch(() => null);
        if (!rep.ok) {
          probleme = (data && data.error) || 'code ' + rep.status;
        } else {
          const problemes = verifier(data);
          if (problemes.length > 0) {
            probleme = problemes.join(' ; ');
          } else {
            ok = true;
            jeu = data;
          }
        }
      } catch (e) {
        probleme = e.name === 'TimeoutError' ? 'trop lent (plus de 180 s)' : String(e.message || e);
      }
      const secondes = Number(((Date.now() - debut) / 1000).toFixed(1));
      resultats.push({ matiere: cours.matiere, mode: mode, ok: ok, secondes: secondes, probleme: probleme, jeu: jeu });
      console.log('(' + numero + '/' + total + ') ' + cours.matiere.padEnd(8) + mode.padEnd(10) + (ok ? '✅' : '❌') + '  ' + secondes + ' s' + (ok ? '' : '  ' + probleme));
    }
  }

  console.log('\n=========== RÉSUMÉ ===========');
  console.log('Matière   Mode       Résultat   Durée');
  resultats.forEach((r) => {
    console.log(r.matiere.padEnd(10) + r.mode.padEnd(11) + (r.ok ? '✅' : '❌').padEnd(11) + r.secondes + ' s');
  });
  const reussis = resultats.filter((r) => r.ok).length;
  const moyenne = resultats.reduce((somme, r) => somme + r.secondes, 0) / resultats.length;
  console.log('\n' + reussis + ' réussi(s) sur ' + total + ' | durée moyenne : ' + moyenne.toFixed(1) + ' s');

  fs.writeFileSync('resultats-tests.json', JSON.stringify({
    date: new Date().toISOString(),
    reussis: reussis,
    total: total,
    dureeMoyenneSecondes: Number(moyenne.toFixed(1)),
    resultats: resultats
  }, null, 2), 'utf-8');
  console.log('Le détail est enregistré dans resultats-tests.json');
}

main();
