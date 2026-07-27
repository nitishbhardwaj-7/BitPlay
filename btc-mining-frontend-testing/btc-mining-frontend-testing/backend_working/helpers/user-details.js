// /helpers/list_db_addresses.js
import mongoose from "mongoose";
import UserMiningDetail from "../models/UserMiningDetails.js";

const MONGO_URI = "mongodb+srv://bitplaypro:owH5NTgw3PohNY3S@cluster0.gzkzosz.mongodb.net/bitplay-pro ";

async function main() {
  try {
    await mongoose.connect(MONGO_URI, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    });

    const UserDetails = await UserMiningDetail.find({}).lean();

    if (!UserDetails.length) {
      console.log("No User Details found.");
    } else {
      console.log(`Found ${UserDetails.length} UserDetails:\n`);
      UserDetails.forEach((a, i) => {
        console.log(`${i + 1}.`, a); // print full document
      });
    }

    await mongoose.disconnect();
  } catch (err) {
    console.error("Error fetching Deposit UserDetails:", err.message);
    process.exit(1);
  }
}

main();
