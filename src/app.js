import express from "express";
import cors from "cors";
import morgan from "morgan";
import "dotenv/config";

const app = express();

app.use(cors({ origin: "*", credentials: true, optionsSuccessStatus: 202 }));
app.use(express.json({ limit: "10mb" }));
app.use(morgan("dev"));

// your routes
import routes from "./routes/main.routes.js";
app.use("/api", routes);

app.get("/health", (req, res) => {
  return res.status(200).send({ status: "ok" });
});

app.use((req, res) => {
  return res.status(404).send({ message: "Route not found" });
});

export default (req, res) => {
  app(req, res);
};
