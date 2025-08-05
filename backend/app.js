import bodyParser from "body-parser";
import dotenv from "dotenv";
import cors from "cors";
import { app } from "./src/routes/openaiRoutes.js";

dotenv.config();

app.use(bodyParser.json());
const corsOptions = {
  origin: "*",
  allowedHeaders: [
    "Origin",
    "X-Requested-With",
    "Content-Type",
    "Accept",
    "Authorization",
    "useremail",
    'api-keys',
    'role'
  ],
};

app.use(cors(corsOptions));

app.listen(process.env.PORT, () => {
  console.log(`Server is running on port ${process.env.PORT}`);
});

app.use((err, req, res, next) => {
  console.error("Middleware error handler:", err.stack || err);
  res.status(500).json({ error: "A server error occurred." });
});