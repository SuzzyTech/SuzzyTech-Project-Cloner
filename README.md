# SuzzyTech Project Cloner

Quickstart:
1. Install Node.js (v14+ recommended).
2. In the project folder run:
   ```
   npm install
   node server.js
   ```
3. Open http://localhost:3000 in your browser.

What it does:
- Upload a ZIP of your bot/project.
- Provide unlimited old→new mappings (UI adds more fields automatically).
- Replaces occurrences in text files and optionally renames filenames.
- Returns a new ZIP you can download.

Security notes:
- Always test on copies of your project.
- Consider adding authentication and sandboxing for production.
