const express = require('express');
const router = express.Router();
const { body } = require('express-validator');

const youtube_controller = require('../../controller/gpt3/youtube');

router.post('/summarizer', youtube_controller.checkSubjectVerbAgreement);


module.exports = router;
