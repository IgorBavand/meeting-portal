module.exports = {
  "/api/**": {
    target: "http://localhost:8181",
    secure: false,
    changeOrigin: true,
    logLevel: "debug"
  }
};
