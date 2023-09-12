import express from "express";
import * as dotenv from "dotenv";
import { PineconeClient } from "@pinecone-database/pinecone";
import { queryPinecone } from "../gptTuning/utils.js";
import { indexName } from "../gptTuning/config.js";

dotenv.config();

const router = express.Router();

router.route("/").post(async (req, res) => {
  const { query } = req.body;
  try {
    const pineconeClient = new PineconeClient();
    await pineconeClient.init({
      apiKey: process.env.PINECONE_API_KEY,
      environment: process.env.PINECONE_ENVIRONEMENT,
    });

    const text = await queryPinecone(pineconeClient, indexName, query);

    res.status(200).json(text);
  } catch (err) {
    console.log(err, "errrrrrrrrrrrrr");
    res.status(500).json({ success: false, message: err });
  }
});

export default router;
