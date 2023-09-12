import express from "express";
import * as dotenv from "dotenv";
import cors from "cors";

//parse incoming requests
import bodyParser from "body-parser";
//managing user sessions
import session from "express-session";

import gptSemanticSearchRoutes from "./routes/gptSemanticSearchRoutes.js";
import { loadTrainingData } from "./gptTuning/utils.js";

const app = express();

//serves static files from public folder
app.use(express.static("public"));

//parses incoming req bodies
app.use(bodyParser.json({ limit: "10mb" }));
app.use(bodyParser.urlencoded({ limit: "10mb", extended: true }));
// //use express-session
app.use(
  session({
    secret: process.env.SESSION_SECRET,
    resave: false,
    saveUninitialized: true,
  })
);

dotenv.config();

app.use(
  cors({
    origin: "*",
  })
);

app.use(express.json({ limit: "50mb" }));

app.use("/api/v1/gptSearch", gptSemanticSearchRoutes);

app.get("/", async (req, res) => {
  res.status(200).json({
    message: "Hello from Server",
  });
});

const startServer = async () => {
  try {
    if (process.env.NODE_ENV === "development") {
      app.listen(8080, () =>
        console.log(`Server started on port 8080, in development mode`)
      );
    } else {
      console.log("production");
      app.listen(process.env.PORT, () =>
        console.log(`Server started on port ${process.env.PORT}`)
      );
    }
  } catch (error) {
    console.log(error);
  }

  try {
    await loadTrainingData();
  } catch (err) {
    console.log("error: ", err);
  }
};

startServer();
