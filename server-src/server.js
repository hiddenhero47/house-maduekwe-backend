const express = require("express");
const multer = require("multer");
const bodyParser = require("body-parser");
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

const publicPath = path.join(__dirname, "public");

//middleware for body parser
const forms = multer();
app.use(express.json());
app.use(forms.any());
app.use(express.urlencoded({ extended: false }));

// Declaring Static Folder
app.use(express.static(path.join(__dirname, "public")));
app.use(
  "/public",
  express.static(publicPath, {
    index: false, // prevent directory listing
    dotfiles: "ignore", // ignore .env, .gitignore if misplaced
    setHeaders: (res, filePath) => {
      // Optional security headers
      res.set("X-Content-Type-Options", "nosniff");
      const ext = path.extname(filePath).toLowerCase();
      if (ext === ".js" || ext === ".html") {
        res.setHeader("Content-Disposition", "attachment");
        res.setHeader("Content-Type", "text/plain");
      }
    },
  })
);

//middleware cors
app.use(handleCors);

app.use("/api/setup", require("./routes/setupRoutes"));
app.use("/api/users", require("./routes/useRoutes"));
app.use("/api/addresses", require("./routes/addressRoutes"));
app.use("/api/attributes", require("./routes/attributeRoutes"));
app.use("/api/categories", require("./routes/categoryRoutes"));
app.use("/api/shop-items", require("./routes/shopItemRoutes"));
app.use("/api/cart", require("./routes/cartRoutes"));

app.use(errorHandler);

app.listen(port, () => 
  console.log(`🚀 Server started on port ${port}`)
);

