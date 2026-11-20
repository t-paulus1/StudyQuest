StudyQuest turns a student’s lesson notes into an interactive revision game. Select a game mode and school level, then practise with AI-generated missions based on the lesson.

## Try the project

Live demo: https://studyquest-pixel-local.netlify.app

## The problem

Revision can feel repetitive and difficult to stick with. StudyQuest makes studying more engaging by placing lesson-based questions inside short game scenarios.

## Features

- Paste lesson text or upload a .txt or PDF file.
- Choose Adventure, Investigation, Survival, or Strategy mode.
- Select a level for middle school, high school, or higher education.
- Get hints, explanations, scores, and a review of topics to practise.
- Review missed points with new questions; track progress with a notebook, profile, XP, levels, and badges.
- Explore a 3D island in Adventure mode. A no-AI demo mode is also available.

## AI and technology

StudyQuest uses NVIDIA Nemotron through NVIDIA’s API to generate game missions from the student’s lesson. The server validates the model’s response before sending the game to the browser. The API key must be stored as an environment variable and must never be committed to this repository.

The project uses HTML, CSS, JavaScript, Node.js, Express, Three.js, Netlify Functions, and Netlify Blobs. AI-assisted development tools included ChatGPT, Claude, and Roo Code for brainstorming, planning, coding, and troubleshooting; the project author directed and reviewed the work.

## Run locally

Requirements: Node.js and npm.

1. Install dependencies with `npm install`.
2. Create a `.env` file and add `NVIDIA_API_KEY=your_nvidia_api_key`.
3. Start the server with `npm start`.
4. Open `http://localhost:3000`.

The no-AI demo mode does not require an API key. AI generation requires a valid NVIDIA API key and an internet connection. Never publish your `.env` file or API key.

## Project status

Adventure is the most developed 3D mode. Investigation, Survival, and Strategy currently use a simpler 3D room instead of separate explorable worlds. The 3D exploration is intended for desktop keyboard and mouse; the standard game is usable on phones. AI generation depends on the API being available.

Built for the STEM2Connect AI Hackathon.
