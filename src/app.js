import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import http from "http";
import path from "path";
import { fileURLToPath } from 'url';
import router from "./routes/main.routes.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export class App {
  constructor() {  
    dotenv.config()
    this.app = express();
    this.app.use(express.json());
    this.http = new http.Server(this.app);
    this.PORT = process.env.PORT || 8000;
    this.initMiddleware();
    this.initRoutes();
  }

  initMiddleware() {
    this.app.use(cors());
    this.app.use(
      (req, res, next) => {
        if (req.originalUrl.includes("stripe")) {
          next();
        } else {
          express.json()(req, res, next);
        }
      }
    );
  }


  initRoutes() {
    const publicPath = path.join(__dirname, "..", "public");
    this.app.use(express.static(publicPath));
    this.app.use("/api", router);
  }

  createServer() {
    this.http.listen(this.PORT, () => {
      console.log("Server started at port " + this.PORT);
    });
  }
}