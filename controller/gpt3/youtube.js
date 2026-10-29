const natural = require('natural');
const lexicon = new natural.Lexicon('EN', 'Noun', 'Verb');
const ruleSet = new natural.RuleSet('EN');

// Initialize BrillPOSTagger with lexicon and rule set

exports.checkSubjectVerbAgreement = async (req, res, next) => {
  try {
    const inputText = req.body.content;
    const tokenizer = new natural.WordTokenizer();
    const inputTokens = tokenizer.tokenize(inputText);

    // Perform Part-of-Speech tagging
    const POSTagger = new natural.BrillPOSTagger(lexicon, ruleSet);

    const taggedTokens = POSTagger.tag(inputTokens);

    // Find subject-verb agreement errors
    const errors = [];
    let currentSubject = null;
    let currentVerb = null;
    taggedTokens.forEach((token, index) => {
        console.log(token)
    });

    res.status(200).send(errors);
  } catch (e) {
    res.status(400).send({error: e});
  }
}