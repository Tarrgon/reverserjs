const fs = require("fs")

if (fs.existsSync("./distclean/dist")) fs.rmSync("./distclean/dist", { recursive: true, force: true })