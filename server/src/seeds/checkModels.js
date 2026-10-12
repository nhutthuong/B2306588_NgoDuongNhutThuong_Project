import { connectDB, disconnectDB } from '../config/db.js';
import models from '../models/index.js';

const checkModels = async () => {
  try {
    await connectDB();
    console.log('\n--- DONG BO VA KIEM TRA INDEX CAC MODEL ---');

    for (const [modelName, Model] of Object.entries(models)) {
      console.log(`\nModel: ${modelName} (Collection: ${Model.collection.name})`);
      
      // Dong bo index schema voi database
      await Model.syncIndexes();

      // Lay danh sach index thuc te tu MongoDB
      const indexes = await Model.collection.indexes();
      indexes.forEach((idx, i) => {
        const keyStr = JSON.stringify(idx.key);
        const extra = [];
        if (idx.unique) extra.push('unique');
        if (idx.partialFilterExpression) {
          extra.push(`partialFilter: ${JSON.stringify(idx.partialFilterExpression)}`);
        }
        if (idx.expireAfterSeconds !== undefined) {
          extra.push(`expireAfterSeconds: ${idx.expireAfterSeconds}`);
        }
        if (idx.collation) {
          extra.push(`collation: ${JSON.stringify(idx.collation)}`);
        }
        if (idx.weights) {
          extra.push(`textWeights: ${JSON.stringify(idx.weights)}`);
        }

        const extraStr = extra.length > 0 ? ` [${extra.join(', ')}]` : '';
        console.log(`  ${i + 1}. ${idx.name}: ${keyStr}${extraStr}`);
      });
    }

    console.log('\n--- HOAN THANH KIEM TRA MODEL VA INDEX ---\n');
  } catch (error) {
    console.error('Loi kiem tra models:', error);
  } finally {
    await disconnectDB();
    process.exit(0);
  }
};

checkModels();
