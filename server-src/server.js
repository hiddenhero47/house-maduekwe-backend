const express = require("express");
const multer = require("multer");
const bodyParser = require("body-parser");
const colors = require("colors");
const dotenv = require("dotenv").config();
const { errorHandler } = require("./middleware/errorMiddleware");
const connectDB = require("./config/db");
const port = process.env.PORT || 6000;
const path = require("path");
const handleCors = require("./middleware/corsMiddleware");

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
app.use("/api/user", require("./routes/userRoutes"));
app.use("/api/addresses", require("./routes/addressRoutes"));
app.use("/api/attributes", require("./routes/attributeRoutes"));
app.use("/api/categories", require("./routes/categoryRoutes"));
app.use("/api/shop-items", require("./routes/shopItemRoutes"));
app.use("/api/cart", require("./routes/cartRoutes"));
app.use("/api/item-groups", require("./routes/itemGroupRoutes"));
app.use("/api/reviews", require("./routes/reviewRoutes"));
app.use("/api/export-fees", require("./routes/exportFeeRoutes"));
app.use("/api/payment-providers", require("./routes/paymentProviderRoutes"));
app.use("/api/orders", require("./routes/orderRoutes"));
app.use("/api/payment", require("./routes/paymentRoutes"));

app.use(errorHandler);

app.listen(port, () => 
  console.log(`🚀 Server started on port ${port}`)
);

