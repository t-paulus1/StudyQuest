# StudyQuest

StudyQuest turns a student’s lesson notes into a playable revision game. Choose a game mode and school level, then use AI-generated missions based on the lesson to practise and review key ideas.

## Try StudyQuest

Live demo: https://studyquest-pixel-local.netlify.app

> If the demo is unavailable, use the local setup below. The project also includes a no-AI demo mode.

## The problem

Revision can feel repetitive and hard to stick with. StudyQuest aims to make studying more engaging by putting lesson-based questions inside short game scenarios.

## What it does

- Accepts lesson text pasted by the student, with support for `.txt` and PDF files.
- Offers four modes: Adventure, Investigation, Survival, and Strategy.
- Adjusts question language for middle school, high school, or higher education.
- Builds questions from the supplied lesson and asks the AI not to add information beyond it.
- Gives hints, explanations, a score, and a review of topics to practise.
- Includes a review option that creates new questions about missed points, plus a notebook, profile, XP, levels, and badges.
- Provides a first-person 3D island exploration in Adventure mode and a no-AI demo mode.
- Supports English, French, and Spanish, with a selectable QWERTY or AZERTY keyboard layout.

## Controls

On desktop, use the mouse to look around, WASD (QWERTY) or ZQSD (AZERTY), or the arrow keys to move. Hold Shift to run, press Space to jump, and press E or click to open a mission. Press Tab to open the map, M to toggle sound, and Esc to release the mouse. The 3D Adventure exploration is enabled by default on desktop; touch devices use the standard game controls.

There is no minimum lesson length. The game needs lesson text to create AI-generated questions; the no-AI demo can be explored without a lesson.

## AI and implementation

StudyQuest uses NVIDIA Nemotron through NVIDIA’s API to generate lesson-based game missions. The server sends the lesson and game settings to the model, checks the returned JSON and answer choices, and serves the validated game to the browser. The API key is read from an environment variable and must never be committed to the repository.

The project uses HTML, CSS, and JavaScript in the browser, Node.js and Express for the local server, Three.js for 3D scenes, and Netlify Functions for the hosted AI generation endpoints. Netlify Blobs is included as a dependency.

AI-assisted development tools used during the project include ChatGPT, Claude, and Roo Code. They supported brainstorming, planning, coding, and troubleshooting; the project author directed and reviewed the work.

## Run locally

Requirements: Node.js and npm.

1. Clone or download this repository and open a terminal in the project folder.
2. Install dependencies with `npm install`.
3. Create a `.env` file in the project folder and add `NVIDIA_API_KEY=your_nvidia_api_key`. Optionally configure `NVIDIA_MODEL` or `NVIDIA_API_URL`. Never commit a real API key.
4. Start the local server with `npm start`.
5. Open http://localhost:3000 in your browser.

You can explore the no-AI demo mode without configuring an API key. AI-powered generation requires a valid NVIDIA API key and an internet connection.

## Deploying to Netlify

The repository includes a `netlify.toml` configuration for the static site and serverless functions. In the Netlify site settings, add `NVIDIA_API_KEY` as an environment variable for the functions, then deploy the repository. Do not put the key in frontend code or commit it in `.env`.

## Project status and limitations

Adventure is the most developed 3D mode. Investigation, Survival, and Strategy use a simpler 3D room rather than their own dedicated explorable worlds. The 3D exploration is intended for desktop keyboard and mouse; the standard game is usable on phones. AI generation depends on the API being available and may take time; use the no-AI demo mode if it is unavailable.

## Acknowledgements

Built for the STEM2Connect AI Hackathon. Thanks to NVIDIA for the model API and to ChatGPT, Claude, and Roo Code for assistance during development.
