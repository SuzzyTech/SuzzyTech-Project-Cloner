
import express from "express";
import fileUpload from "express-fileupload";
import fs from "fs-extra";
import path from "path";
import AdmZip from "adm-zip";
import archiver from "archiver";

const app = express();
app.use(fileUpload());
app.use(express.static("public"));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Replace text safely (handles overlapping names by sorting by length)
const replaceInText = (text, mappings) => {
  mappings.sort((a, b) => b.old.length - a.old.length);
  for (const { old, new: newVal } of mappings) {
    if (!old || !newVal) continue;
    const safeOld = old.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const regex = new RegExp(safeOld, 'g');
    text = text.replace(regex, newVal);
  }
  return text;
};

app.post("/upload", async (req, res) => {
  if (!req.files || !req.files.zipFile) return res.status(400).send("No file uploaded");

  const zipFile = req.files.zipFile;
  const mappings = JSON.parse(req.body.mappings || "[]");
  const tempDir = path.join("uploads", Date.now().toString());
  await fs.ensureDir(tempDir);

  const zipPath = path.join(tempDir, zipFile.name);
  await zipFile.mv(zipPath);

  const zip = new AdmZip(zipPath);
  zip.extractAllTo(tempDir, true);

  const processDir = async (dir) => {
    const files = await fs.readdir(dir);
    for (const file of files) {
      const fullPath = path.join(dir, file);
      const stat = await fs.stat(fullPath);

      if (stat.isDirectory()) {
        await processDir(fullPath);
      } else {
        const ext = path.extname(fullPath).toLowerCase();
        const textFileTypes = [".js", ".json", ".txt", ".html", ".yml", ".env", ".md", ".ts", ".py", ".jsx", ".tsx"];
        if (textFileTypes.includes(ext)) {
          let content = await fs.readFile(fullPath, "utf8");
          content = replaceInText(content, mappings);
          await fs.writeFile(fullPath, content, "utf8");
        }
        // Rename files if old name appears in filename
        let newName = file;
        for (const { old, new: newVal } of mappings.sort((a, b) => b.old.length - a.old.length)) {
          const safeOld = old.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
          newName = newName.replace(new RegExp(safeOld, 'g'), newVal);
        }
        if (newName !== file) {
          await fs.rename(fullPath, path.join(dir, newName));
        }
      }
    }
  };

  await processDir(tempDir);

  const outputZip = path.join(tempDir, "ModifiedProject.zip");
  const output = fs.createWriteStream(outputZip);
  const archive = archiver("zip");
  archive.pipe(output);
  archive.directory(tempDir, false);
  await archive.finalize();

  res.download(outputZip, "SuzzyTech_Modified_Bot.zip");
});

app.listen(3000, () => console.log("🚀 SuzzyTech Project Cloner v2 running on http://localhost:3000"));
