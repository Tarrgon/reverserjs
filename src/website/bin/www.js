#!/usr/bin/env node
require("source-map-support").install();

(async () => {
  /**
 * Module dependencies.
 */

  const config = require("../../config.json")
  const app = await require("../index")()
  const http = require(!config.secure ? "http" : "https")
  const fs = require("fs")

  /**
   * SSL dependencies.
   */

  if (config.secure) {
    console.log("Starting secure")
    var privateKey = fs.readFileSync(config.internal.ssl.privateKeyLocation, { encoding: "utf8" })
    var certificate = fs.readFileSync(config.internal.ssl.certificateLocation, { encoding: "utf8" })
    var ca = fs.readFileSync(config.internal.ssl.chainLocation, { encoding: "utf8" })
  }

  /**
   * Get port from environment and store in Express.
   */

  const port = normalizePort(config.web.port || "80")
  app.set("port", port)

  /**
   * Create HTTP server.
   */

  const serverOptions = !config.secure ? {} : {
    key: privateKey,
    cert: certificate,
    ca: ca
  }

  const server = http.createServer(serverOptions, app)

  /**
   * Listen on provided port, on all network interfaces.
   */

  server.listen(port, "0.0.0.0")
  server.on("error", onError)
  server.on("listening", onListening)

  /**
   * Normalize a port into a number, string, or false.
   */

  function normalizePort(val) {
    let port = parseInt(val, 10)

    if (isNaN(port)) return val

    if (port >= 0) return port

    return false
  }

  /**
   * Event listener for HTTP server "error" event.
   */

  function onError(error) {
    if (error.syscall !== "listen") {
      throw error
    }

    let bind = typeof port === "string"
      ? "Pipe " + port
      : "Port " + port

    // handle specific listen errors with friendly messages
    switch (error.code) {
      case "EACCES":
        console.error(bind + " requires elevated privileges")
        process.exit(1)
        break
      case "EADDRINUSE":
        console.error(bind + " is already in use")
        process.exit(1)
        break
      default:
        throw error
    }
  }

  /**
   * Event listener for HTTP server "listening" event.
   */

  function onListening() {
    const addr = server.address()
    const bind = typeof addr === "string"
      ? "pipe " + addr
      : "port " + addr.port
    // debug("Listening on " + bind) idk
    console.log("Listening on " + bind)
  }
})()
