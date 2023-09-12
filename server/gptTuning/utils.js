import { OpenAIEmbeddings } from "langchain/embeddings/openai";
import { RecursiveCharacterTextSplitter } from "langchain/text_splitter";
import { OpenAI } from "langchain/llms/openai";
import { loadQAStuffChain } from "langchain/chains";
import { Document } from "langchain/document";
import { timeout } from "./config.js";
import { DirectoryLoader } from "langchain/document_loaders/fs/directory";
import { TextLoader } from "langchain/document_loaders/fs/text";
import { PDFLoader } from "langchain/document_loaders/fs/pdf";
import { PineconeClient } from "@pinecone-database/pinecone";
import { indexName } from "./config.js";

export const createPineconeIndex = async (
  client,
  indexName,
  vectorDimension
) => {
  // 1. Initiate index existence check
  console.log(`Checking "${indexName}"...`);
  // 2. Get list of existing indexes
  const existingIndexes = await client.listIndexes();
  // 3. If index doesn't exist, create it
  if (!existingIndexes.includes(indexName)) {
    // 4. Log index creation initiation
    console.log(`Creating "${indexName}"...`);
    // 5. Create index
    await client.createIndex({
      createRequest: {
        name: indexName,
        dimension: vectorDimension,
        metric: "cosine",
      },
    });
    // 6. Log successful creation
    console.log(
      `Creating index.... please wait for it to finish initializing.`
    );
    // 7. Wait for index initialization
    await new Promise((resolve) => setTimeout(resolve, timeout));
  } else {
    // 8. Log if index already exists
    console.log(`"${indexName}" already exists.`);
  }
};

export const updatePinecone = async (client, indexName, docs) => {
  const index = client.Index(indexName);

  console.log("Pinecone index:", index);

  //process each document
  for (const doc of docs) {
    console.log("processing document...", doc.metadata.source);

    const txtPath = doc.metadata.source;
    const text = doc.pageContent;

    //create recursiveChar text splitter instance
    const textSplitter = new RecursiveCharacterTextSplitter({
      chunkSize: 1000,
    });

    //split text
    const chunks = await textSplitter.createDocuments([text]);
    console.log(`Text split into ${chunks.length} chunks`);

    //Create OpenAI embeddings to use with pinecone
    const embeddingsArrays = await new OpenAIEmbeddings().embedDocuments(
      chunks.map((chunk) => chunk.pageContent.replace(/\n/g, " "))
    );
    console.log("Finished embedding documents");
    console.log(
      `Creating ${chunks.length} vectors array with id, values, and metadata...`
    );

    //create and add vectors to pinecone
    const batchSize = 100;
    let batch = [];
    for (let i = 0; i < chunks.length; i++) {
      const chunk = chunks[i];
      const vector = {
        id: `${txtPath}_${i}`,
        values: embeddingsArrays[i],
        metadata: {
          ...chunk.metadata,
          loc: JSON.stringify(chunk.metadata.loc),
          pageContent: chunk.pageContent,
          txtPath: txtPath,
        },
      };
      batch = [...batch, vector];
      // When batch is full or it's the last item, upload to pinecone.
      if (batch.length === batchSize || i === chunks.length - 1) {
        await index.upsert({
          upsertRequest: {
            vectors: batch,
          },
        });
        // Empty the batch
        batch = [];
      }
    }
    console.log(`Pinecone index updated with ${chunks.length} vectors`);
  }
};

export const queryPinecone = async (client, indexName, query) => {
  const index = client.Index(indexName);

  const engineeredQuery = `Respond to this query in less than 3 sentences, query is delimited by triple asterisks .
  
  Query:***${query}***`;

  const queryEmbeddings = await new OpenAIEmbeddings().embedQuery(
    engineeredQuery
  );

  // 4. Query Pinecone index and return top 10 matches
  let queryResponse = await index.query({
    queryRequest: {
      topK: 10,
      vector: queryEmbeddings,
      includeMetadata: true,
      includeValues: true,
    },
  });

  // 5. Log the number of matches
  console.log(`Found ${queryResponse.matches.length} matches...`);
  // 6. Log the question being asked
  console.log(`Asking question: ${engineeredQuery}...`);

  if (queryResponse.matches.length) {
    //create an openAI instance
    const llm = new OpenAI({});
    const chain = loadQAStuffChain(llm);

    //extract and concatenate content found
    const content = queryResponse.matches
      .map((match) => match.metadata.pageContent)
      .join(" ");

    const result = await chain.call({
      input_documents: [new Document({ pageContent: content })],
      question: query,
    });

    console.log("answer", result.text);
    return result.text;
  } else {
    console.log("No matches found");
  }
};

export const loadTrainingData = async () => {
  const loader = new DirectoryLoader("./documents", {
    ".txt": (path) => new TextLoader(path),
    ".md": (path) => new TextLoader(path),
    ".pdf": (path) => new PDFLoader(path),
  });

  try {
    const docs = await loader.load();
    const vectorDimensions = 1536;

    const client = new PineconeClient();

    await client.init({
      apiKey: process.env.PINECONE_API_KEY || "",
      environment: process.env.PINECONE_ENVIRONEMENT || "",
    });

    await createPineconeIndex(client, indexName, vectorDimensions);
    await updatePinecone(client, indexName, docs);

    console.log("successfully created index and loaded data into pinecone...");
  } catch (err) {
    console.log("error loading training data: ", err);
  }
};
