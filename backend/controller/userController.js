const asyncHandler = require("express-async-handler");
const User = require("../models/userModel");
const bcry = require("bcrypt");
const fs = require("fs");
const path = require("path");
const storage = require("node-persist");
const delay = 2 * 60 * 1000;
const client = require("twilio")(
  process.env.TWILIO_ACCOUNT_SID,
  process.env.TWILIO_AUTH_TOKEN
);

const speakeasy = require("speakeasy");

//@desc Login user
//@Route /api/user/login
//access Private
const userLogin = asyncHandler(async (req, res) => {
  const { contactNumber, password, type } = req.body;

  if (!contactNumber || !password || !type) {
    res.send(
      res.json({ success: false, message: "Please fill your Credentails" })
    );
  }
  const userdata = await User.findOne({ ContactNo: contactNumber });
  if (userdata && (await bcry.compare(password, userdata.Password))) {
    if (type == "Admin") {
      res.send({
        success: true,
      });
    } else {
      res.send({
        success: true,
        name: userdata,
      });
    }
  } else {
    res.send({ success: false, message: "Incorrect Username or Password" });
  }
});

//@desc Register user
//@Route /api/user/verify
//access Private
const sendOtp = asyncHandler(async (req, res) => {
  const { name, type, contactNo } = req.body;
  if (!name || !type || !contactNo) {
    return res.send({
      success: false,
      message: "Please Enter your Number Properly",
    });
  }

  const data = await User.findOne({ ContactNo: contactNo });

  if (data) {
    res.send({ success: false, message: "Already Registered Number" });
  } else {
    const secret = speakeasy.generateSecret({ length: 20 }); // Generate a secret key
    const otp = speakeasy.totp({
      secret: secret.base32,
      encoding: "base32",
    });

    await storage.init({
      dir: "tempData",
      stringify: JSON.stringify,
      parse: JSON.parse,
      writeQueue: true,
      writeQueueWriteOnlyLast: true,
      expiredInterval: 2 * 60 * 1000,
    });
    const mergedData = {
      otp: otp,
      data: req.body,
    };
    await storage.setItem(name, mergedData);
    setTimeout(() => {
      storage.removeItem(name);
    }, delay);

    await client.messages
      .create({
        body:
          otp +
          " is your OTP to login to WDA. Do not share with anyone. WDA never calls to ask for OTP. The OTP expires in 2 mins.",
        to: "+91" + contactNo,
        from: "+16672819468",
      })
      .then(() =>
        res.send({
          success: true,
          message: "OTP has been Send To Your Entered Number",
        })
      )
      .catch((error) => {
        res.send({ success: false, message: "Something Went Wrong" });
      });
  }
});

//@desc User Registeration
//@Route /api/user/verifyOtp
//access Private
const verifyOtp = asyncHandler(async (req, res) => {
  const { otpCode, name } = req.body;
  if (!otpCode) {
    res.send({ success: false, message: "Send OTP Properly" });
  } else {
    try {
      const data = await storage.getItem(name);
      if (data["otp"] == otpCode) {
        res.send({ success: true, message: "Otp Verified" });
      } else {
        res.send({ success: false, message: "Wrong OTP Please Try Again" });
      }
    } catch (e) {
      res.send({ success: false, message: "Otp Expired Resend Again" });
    }
  }
});

//@desc User Registeration
//@Route /api/user/registerUser
//access Private
const registerUser = asyncHandler(async (req, res) => {
  const { name, password, confirmpassword } = req.body;
  if (!password || !confirmpassword) {
    res.send({ success: false, message: "Please Enter Password Properly" });
  } else {
    if (password != confirmpassword) {
      res.send({
        success: false,
        message: "Password and ConfirmPassword Doesn't Match",
      });
    } else {
      const salt = await bcry.genSalt(10);
      const hashpassword = await bcry.hash(password, salt);
      const data = await storage.getItem(name);
      const userdata = await User.create({
        Name: data["data"]["name"],
        Type: data["data"]["type"],
        ContactNo: data["data"]["contactNo"],
        Password: hashpassword,
      });
      if (userdata) {
        res.send(
          res.json({
            success: true,
          })
        );
      } else {
        res.send({ success: false, message: "Invalid User Data" });
      }
    }
  }
});

//@desc Update User Profile
//@Route /api/user/updateUserProfile
//access Private
const updateUserProfile = asyncHandler(async (req, res) => {
  const {
    name,
    gender,
    contactNumber,
    dob,
    address,
    city,
    state,
    pincode,
    profileImagePath,
  } = req.body;

  if (profileImagePath) {
    const imageBuffer = Buffer.from(profileImagePath, "base64");

    const newPath = path.dirname(__dirname);

    const userName = name.replace(/\s+/g, "");

    const folderpath = path.join(newPath, "userProfile");

    const businessImagePath = folderpath.replace(/\\/g, "/");
    fs.writeFile(`${businessImagePath}/${userName}.jpg`, imageBuffer, (err) => {
      if (err) {
        return res.send({
          success: false,
          message: "Error saving image to Server",
        });
      }
    });
    const updateByNumber = { ContactNo: contactNumber };
    const update = {
      $set: {
        Name: name,
        Gender: gender,
        DOB: dob,
        Address: address,
        City: city,
        State: state,
        Pincode: pincode,
        Image: `${userName}.jpg`,
      },
    };
    const result = await User.updateOne(updateByNumber, update);
    if (result) {
      return res.send({ success: true, message: "Profile Updated" });
    } else {
      return res.send({ success: false, message: "SomeThing Went Wrong" });
    }
  } else {
    const updateByNumber = { ContactNo: contactNumber };
    const update = {
      $set: {
        Name: name,
        Gender: gender,
        DOB: dob,
        Address: address,
        City: city,
        State: state,
        Pincode: pincode,
      },
    };
    const result = await User.updateOne(updateByNumber, update);
    if (result) {
      return res.send({ success: true, message: "Profile Updated" });
    } else {
      return res.send({ success: false, message: "SomeThing Went Wrong" });
    }
  }
});

//@desc Get User Profile
//@Route /api/getUserProfile/:contactNo
//access Private
const getUserProfile = asyncHandler(async (req, res) => {
  const { contactNo } = req.params;
  if (!contactNo) {
    return res.send({ success: false, message: "Getting Error In Profile" });
  } else {
    const profile = await User.findOne({ ContactNo: contactNo });
    res.send({ success: true, userProfile: profile });
  }
});

module.exports = {
  userLogin,
  sendOtp,
  verifyOtp,
  registerUser,
  updateUserProfile,
  getUserProfile,
};
