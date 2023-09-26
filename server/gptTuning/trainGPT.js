import { loadTrainingData } from "./utils.js";
import * as dotenv from "dotenv";
dotenv.config();

const trainGpt = async () => {
  try {
    await loadTrainingData();
    console.log("Successfully trained GPT");
  } catch (err) {
    console.log("error: ", err);
  }
};

trainGpt();
