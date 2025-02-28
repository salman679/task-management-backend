require("dotenv").config();
const express = require("express");
const cors = require("cors");
const morgan = require("morgan");
const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");
const http = require("http");
const { Server } = require("socket.io");

const app = express();
const port = process.env.PORT || 5000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(morgan("dev"));

const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@salman.uweo3xy.mongodb.net/?retryWrites=true&w=majority&appName=Salman`;
const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
});

// HTTP Server & Socket.io Setup
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: "*" },
});

async function run() {
  try {
    await client.connect();
    const db = client.db("Task-Management");
    const taskCollection = db.collection("Tasks");
    const userCollection = db.collection("Users");

    // WebSocket Connection
    io.on("connection", (socket) => {
      console.log("A user connected:", socket.id);

      // Notify all clients when a new task is added
      socket.on("newTask", async (task) => {
        const result = await taskCollection.insertOne(task);
        io.emit("taskAdded", { ...task, _id: result.insertedId });
      });

      // Notify all clients when a task is updated
      socket.on("updateTask", async ({ id, updatedData }) => {
        const filter = { _id: new ObjectId(id) };
        await taskCollection.updateOne(filter, { $set: updatedData });
        io.emit("taskUpdated", { id, updatedData });
      });

      // Notify all clients when a task is deleted
      socket.on("deleteTask", async (id) => {
        const filter = { _id: new ObjectId(id) };
        await taskCollection.deleteOne(filter);
        io.emit("taskDeleted", id);
      });

      socket.on("disconnect", () => {
        console.log("A user disconnected:", socket.id);
      });
    });

    // REST APIs for Fallback
    app.get("/tasks", async (req, res) => {
      const tasks = await taskCollection.find().toArray();
      res.send(tasks);
    });

    app.post("/task", async (req, res) => {
      const task = req.body;
      const result = await taskCollection.insertOne(task);
      io.emit("taskAdded", { ...task, _id: result.insertedId });
      res.send(result);
    });

    app.patch("/task/:id", async (req, res) => {
      const id = req.params.id;
      const updatedTask = req.body;
      const filter = { _id: new ObjectId(id) };
      await taskCollection.updateOne(filter, { $set: updatedTask });
      io.emit("taskUpdated", { id, updatedTask });
      res.send({ message: "Task updated" });
    });

    app.delete("/task/:id", async (req, res) => {
      const id = req.params.id;
      const filter = { _id: new ObjectId(id) };
      await taskCollection.deleteOne(filter);
      io.emit("taskDeleted", id);
      res.send({ message: "Task deleted" });
    });

    // REST APIs for Users
    app.get("/users", async (req, res) => {
      const users = await userCollection.find().toArray();
      res.send(users);
    });

    app.post("/users", async (req, res) => {
      const user = req.body;
      const query = { email: user.email };
      const existingUser = await userCollection.findOne(query);

      if (existingUser) {
        res.send({ message: "User already exists" });
        return;
      }

      const result = await userCollection.insertOne(user);
      res.send(result);
    });

    console.log("Connected to MongoDB!");
  } catch (error) {
    console.error(error);
  }
}
run().catch(console.dir);

app.get("/", (req, res) => {
  res.send("Task management is running...");
});

server.listen(port, () => {
  console.log(`Server running on port ${port}`);
});
