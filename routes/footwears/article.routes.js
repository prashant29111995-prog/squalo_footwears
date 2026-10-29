const express = require("express");
const router = express.Router();

// REAL controller
const articleController = require("../../controller/footwears/article.controller");

//CRUD Categories
router.get("/categories", articleController.getCategories);

// CRUD
router.post("/", articleController.create);
router.get("/", articleController.list);
router.get("/:id", articleController.getById);

router.patch("/:id", articleController.update);
router.delete("/:id", articleController.remove);


module.exports = router;
