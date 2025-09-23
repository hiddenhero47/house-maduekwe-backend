const express = require("express");
const multer = require('multer');
const bodyParser = require('body-parser');
const colors = require("colors");
const dotenv = require("dotenv").config();
const { errorHandler } = require("./middleware/errorMiddleware");
const connectDB = require("./config/db");
const port = process.env.PORT || 5001;
const path = require("path");
const handleCors = require("./middleware/corsMiddleware");
const { ensureAdminExists } = require("./helpers/ensureAdmin");


connectDB();

const app = express();

//middleware for body parser
const forms = multer();
app.use(express.json());
app.use(forms.any());
app.use(express.urlencoded({ extended: false }));

// Declaring Static Folder
app.use(express.static(path.join(__dirname, 'public')));

//middleware cors
app.use(handleCors);

app.use("/api/users", require("./routes/useRoutes"));

app.use(errorHandler);

// app.listen(port, () => console.log(`Server started on port ${port}`));

// Ensure an admin exists before starting the server
app.listen(port, async () => {
    console.log(`🚀 Server started on port ${port}`);
  
    try {
      await ensureAdminExists();
      console.log("✅ Admin check completed.");
    } catch (error) {
      console.error("❌ Error ensuring admin exists:", error);
    }
  });
