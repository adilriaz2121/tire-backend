import express from "express";
import cors from "cors";
import morgan from "morgan";
import "dotenv/config";

const app = express();
const PORT = process.env.PORT || 8000;

app.use(cors());
// Stripe webhook requires raw body for signature verification; mount raw parser before JSON for this path
app.use("/api/user/payments/webhook", express.raw({ type: "application/json" }));
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

// Start local server only when not running in a serverless environment
if (!process.env.VERCEL && !process.env.SERVERLESS) {
  app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
  });
}

export default (req, res) => {
  app(req, res);
};
