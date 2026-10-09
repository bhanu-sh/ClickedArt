const mongoose = require('mongoose');
const Photographer = require('./models/photographerModel');

mongoose.connect('mongodb://127.0.0.1:27017/clickedart').then(async () => {
  const p = await Photographer.findOne({ bestPhotos: { $exists: true, $not: {$size: 0} } });
  console.log(p?.bestPhotos);
  process.exit(0);
});
