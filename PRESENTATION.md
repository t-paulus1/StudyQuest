# StudyQuest : du cours au jeu

## En une phrase
Un site qui transforme le cours d'un élève en jeu : l'élève colle son cours, choisit un mode, et l'IA fabrique les missions.

## Le problème
Réviser est répétitif et peu motivant. Les outils classiques proposent des fiches et des quiz, mais pas l'impression de vivre une aventure.

## La solution
- **Le contenu vient du cours de l'élève** : texte collé, fichier .txt ou PDF.
- **4 modes de jeu** : Aventure, Enquête, Survie, Stratégie. Chacun a son ambiance, ses couleurs et sa règle (cœurs en Survie, jauge de réputation en Stratégie, chemin d'étoiles en Aventure).
- **Les erreurs deviennent des occasions d'apprendre** : indice après une erreur, explication après une bonne réponse, bilan « notions travaillées / à retravailler ».
- **Choix du niveau** : collège, lycée, supérieur.
- **Réviser mes erreurs** : un bouton relance une partie sur les points ratés, avec de nouvelles questions.
- **Le carnet** garde les erreurs d'un jour à l'autre.
- **Profil** : XP, niveaux et 6 badges.
- **Exploration 3D (mode Aventure)** : une île à explorer à la première personne ; chaque mission est cachée dans un lieu (cascade, ruines, grotte…).

## Comment ça marche (technique)
- Le site (navigateur) ne contient **jamais la clé** : elle reste sur un petit serveur Node.js.
- Le serveur envoie le cours à **NVIDIA Nemotron** (API) avec des consignes strictes (s'appuyer uniquement sur le cours, répondre en JSON).
- La réponse est **vérifiée** avant d'être affichée (format, 4 choix, bonne réponse valide, pas de doublons). En cas d'échec, une 2e tentative est faite, puis un message clair s'affiche.
- Les choix sont **mélangés** côté serveur.
- Une **limite de 15 générations par minute** protège le quota.
- **Plan B** : une démo sans IA, qui marche même sans Internet ni clé.

## Démo de 3 minutes (script)
1. (20 s) Montrer l'accueil : « Je colle mon cours. » Cliquer sur Options > Cours d'exemple.
2. (30 s) Choisir **Enquête**, laisser 3 questions, cliquer sur **Lancer le jeu** pendant que tu expliques.
3. (60 s) Jouer 1 mission : se tromper exprès (indice), puis répondre juste (explication). Montrer le score et la barre de progression.
4. (30 s) Écran final : étoiles, XP, notions à retravailler, bouton **Réviser mes erreurs**.
5. (40 s) Revenir à l'accueil, activer **Exploration 3D**, mode **Aventure** : marcher sur l'île, s'approcher d'un cristal, **E**, répondre.
6. (10 s) Conclure : « Chaque cours devient un jeu. »

**Si l'IA est lente ou plante :** Options > Démo sans IA (ou le bouton proposé automatiquement après 90 secondes d'attente).

## Questions probables du jury
- **L'IA peut se tromper ?** Oui. On limite le risque : l'IA doit s'appuyer uniquement sur le cours, le format est vérifié, et chaque réponse est accompagnée d'une explication liée au cours. Un script de test (`node test-generation.js`) mesure la qualité sur 3 matières.
- **Et la clé API ?** Elle n'est jamais envoyée au navigateur.
- **Ça marche sur téléphone ?** Oui pour le jeu classique. L'exploration 3D est réservée à l'ordinateur (clavier + souris).
- **Qu'est-ce qui manque ?** Les îles 3D des modes Enquête, Survie et Stratégie (ils utilisent pour l'instant une salle 3D simple), les comptes en ligne, la sauvegarde sur serveur.

## Avant d'envoyer (liste de vérification)
- [ ] Changer la clé NVIDIA (les anciennes ont circulé) et la mettre dans `.env`.
- [ ] Lancer `node server.js` et faire une partie complète avec l'IA, puis une partie « Démo sans IA ».
- [ ] Tester l'exploration 3D sur l'ordinateur de la présentation.
- [ ] Lire les règles du hackathon (âge, équipe, outils et IA autorisés).
- [ ] Préparer une courte vidéo de secours.
- [ ] Ne pas envoyer le fichier `.env` ni le dossier `node_modules`.
