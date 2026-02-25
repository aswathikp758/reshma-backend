const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");
const dotenv = require("dotenv");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const nodemailer = require("nodemailer");

/* ===== ADDITIONS (REPORTS) ===== */
const multer = require("multer");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

dotenv.config();

const app = express();
const PORT = process.env.PORT || 5000;

/* ================= MIDDLEWARE ================= */
app.use(cors());
app.use(express.json());

/* ===== STATIC FILES (PDF PREVIEW) ===== */
app.use("/uploads", express.static("uploads"));

/* ================= MONGODB ================= */
mongoose
  .connect(process.env.MONGO_URI)
  .then(() => console.log("MongoDB connected"))
  .catch((err) => console.error("MongoDB error:", err));

/* ================= ADMIN SCHEMA ================= */
const adminSchema = new mongoose.Schema({
  name: String,
  email: String,
  password: String,
  sessionId: String,   // ✅ ADD THIS
});
const Admin = mongoose.model("Admin", adminSchema);

/* ================= APPOINTMENT SCHEMA ================= */
const appointmentSchema = new mongoose.Schema(
  {
    name: String,
    email: String,
    phone: String,
    age: Number,
    gender: String,
    service: String,
    message: String,
    doctor: { type: String, default: "" },
    appointmentDate: { type: String, default: "" },
    appointmentTime: { type: String, default: "" },
    status: { type: String, default: "Pending" },
  },
  { timestamps: true }
);
const Appointment = mongoose.model("Appointment", appointmentSchema);

/* ================= DOCTOR SCHEMA ================= */
const doctorSchema = new mongoose.Schema(
  {
    name: String,
    email: { type: String, unique: true },
    specialization: String,
    experience: String,
    phone: String,
    status: { type: String, default: "Available" },
    photo: String,
  },
  { timestamps: true }
);
const Doctor = mongoose.model("Doctor", doctorSchema);
const ServiceSchema = new mongoose.Schema(
  {
    name: String,
    description: String,
    duration: String,
    price: String,
    status: String,
    photo: String, // <-- NEW
  },
  { timestamps: true }
);

const Service = mongoose.model("Service", ServiceSchema);

const blogSchema = new mongoose.Schema(
  {
    title: { type: String, required: true },
    author: { type: String, required: true },
    date: { type: String, required: true },
    content: { type: String, required: true },
    status: { type: String, default: "Draft" },
    image: { type: String, default: "" },
  },
  { timestamps: true }
);

const Blog = mongoose.model("Blog", blogSchema);

/* ================= REPORT SCHEMA (NEW) ================= */
const reportSchema = new mongoose.Schema(
  {
    title: String,
    patientName: String,
    reportDate: { type: Date, default: Date.now },
    pdfFile: String,
    status: { type: String, default: "Completed" },
  },
  { timestamps: true }
);
const Report = mongoose.model("Report", reportSchema);


/* ================= FEEDBACK SCHEMA ================= */
const feedbackSchema = new mongoose.Schema(
  {
    name: String,
    email: String,
    rating: { type: Number, default: 5 }, // 1 to 5
    message: String,
    status: { type: String, default: "Pending" }, // Pending / Approved
  },
  { timestamps: true }
);

const Feedback = mongoose.model("Feedback", feedbackSchema);

const commentSchema = new mongoose.Schema(
  {
    blogId: { type: mongoose.Schema.Types.ObjectId, ref: "Blog", required: true },
    name: { type: String, required: true },
    message: { type: String, required: true },
  },
  { timestamps: true }
);

const Comment = mongoose.model("Comment", commentSchema);
/* ================= JWT SECRET ================= */
const SECRET_KEY =
  "8d8580a134436a4f2d55ac71e1685834d8f0c2d2f2714f05de91cdf5a3011e43";

/* ================= ADMIN ROUTES ================= */
app.post("/Admin/register", async (req, res) => {
  try {
    const { name, email, password } = req.body;
    const existingUser = await Admin.findOne({ email });
    if (existingUser)
      return res.status(400).json({ message: "User already exists" });

    const hashedPassword = await bcrypt.hash(password, 10);
    await new Admin({ name, email, password: hashedPassword }).save();
    res.status(201).json({ message: "User registered successfully" });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

app.post("/Admin/login", async (req, res) => {
  try {
    const { email, password } = req.body;

    const admin = await Admin.findOne({ email });
    if (!admin)
      return res.status(400).json({ message: "User not found" });

    const isValid = await bcrypt.compare(password, admin.password);
    if (!isValid)
      return res.status(400).json({ message: "Invalid credentials" });

    // ✅ Generate session ID
    const sessionId = crypto.randomUUID();

    admin.sessionId = sessionId;
    await admin.save();

    const token = jwt.sign(
      { id: admin._id, sessionId },   // ✅ include sessionId
      SECRET_KEY,
      { expiresIn: "1h" }
    );

    res.json({
      token,
      user: { id: admin._id, name: admin.name, email: admin.email },
    });

  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

/* ================= APPOINTMENT ROUTES ================= */
app.post("/appointments", async (req, res) => {
  const appointment = new Appointment(req.body);
  const saved = await appointment.save();
  res.status(201).json(saved);
});

app.get("/appointments", async (req, res) => {
  try {
    const { search } = req.query;

    let filter = {};

    if (search) {
      filter.name = { $regex: search, $options: "i" };
    }

    const appointments = await Appointment.find(filter).sort({ createdAt: -1 });
    res.json(appointments);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});


// Get appointment by ID
app.get("/appointments/:id", async (req, res) => {
  try {
    const appointment = await Appointment.findById(req.params.id);
    if (!appointment) return res.status(404).json({ message: "Appointment not found" });
    res.json(appointment);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server error" });
  }
});

app.put("/appointments/:id", async (req, res) => {
  const updated = await Appointment.findByIdAndUpdate(
    req.params.id,
    req.body,
    { new: true }
  );
  res.json(updated);
});

app.delete("/appointments/:id", async (req, res) => {
  await Appointment.findByIdAndDelete(req.params.id);
  res.json({ message: "Appointment deleted successfully" });
});

/* ================= REPORT UPLOAD (PDF) ================= */
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const dir = "uploads/reports";
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    cb(null, dir);
  },
  filename: (req, file, cb) => {
    cb(null, Date.now() + "-" + file.originalname);
  },
});

const upload = multer({
  storage,
  fileFilter: (req, file, cb) => {
    file.mimetype === "application/pdf"
      ? cb(null, true)
      : cb(new Error("Only PDF files allowed"));
  },
});

const doctorStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    const dir = "uploads/doctors";
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    cb(null, dir);
  },
  filename: (req, file, cb) => {
    cb(null, Date.now() + "-" + file.originalname);
  },
});

const doctorUpload = multer({
  storage: doctorStorage,
  fileFilter: (req, file, cb) => {
    file.mimetype.startsWith("image/")
      ? cb(null, true)
      : cb(new Error("Only image files allowed"));
  },
});

// --- Service Storage ---
const serviceStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, "uploads/services");
  },
  filename: (req, file, cb) => {
    cb(null, Date.now() + "-" + file.originalname);
  },
});


const uploadService = multer({ storage: serviceStorage });

const blogStorage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, "uploads/blogs");
  },
  filename: function (req, file, cb) {
    cb(null, Date.now() + "-" + file.originalname);
  },
});

const blogUpload = multer({ storage: blogStorage });

/* ================= DOCTOR ROUTES ================= */
app.post("/doctors", doctorUpload.single("photo"), async (req, res) => {
  const doctor = new Doctor({
    ...req.body,
    photo: req.file ? req.file.filename : "",
  });
  res.status(201).json(await doctor.save());
});

app.get("/doctors", async (req, res) => {
  res.json(await Doctor.find().sort({ createdAt: 1 }));
});

app.get("/doctors/:id", async (req, res) => {
  const doctor = await Doctor.findById(req.params.id);
  if (!doctor) return res.status(404).json({ message: "Not found" });
  res.json(doctor);
});

app.put("/doctors/:id", doctorUpload.single("photo"), async (req, res) => {
  const doctor = await Doctor.findById(req.params.id);
  if (!doctor) return res.status(404).json({ message: "Not found" });

  if (req.file && doctor.photo) {
    const oldPath = `uploads/doctors/${doctor.photo}`;
    if (fs.existsSync(oldPath)) fs.unlinkSync(oldPath);
  }

  Object.assign(doctor, req.body);
  if (req.file) doctor.photo = req.file.filename;

  res.json(await doctor.save());
});

app.delete("/doctors/:id", async (req, res) => {
  const doctor = await Doctor.findById(req.params.id);
  if (doctor?.photo) {
    const p = `uploads/doctors/${doctor.photo}`;
    if (fs.existsSync(p)) fs.unlinkSync(p);
  }
  await doctor.deleteOne();
  res.json({ message: "Doctor deleted" });
});




/* ================= REPORT ROUTES ================= */
app.post("/reports", upload.single("pdf"), async (req, res) => {
  const report = new Report({
    title: req.body.title,
    patientName: req.body.patientName,
    status: req.body.status,
    pdfFile: req.file.filename,
  });
  await report.save();
  res.status(201).json(report);
});

app.get("/reports", async (req, res) => {
  const reports = await Report.find().sort({ createdAt: -1 });
  res.json(reports);
});

app.delete("/reports/:id", async (req, res) => {
  const report = await Report.findById(req.params.id);
  if (report) {
    fs.unlinkSync(`uploads/reports/${report.pdfFile}`);
    await report.deleteOne();
  }
  res.json({ message: "Report deleted successfully" });
});




app.get("/services", async (req, res) => {
  try {
    const services = await Service.find().sort({ createdAt: 1 });
    res.json(services);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});


app.get("/services/:id", async (req, res) => {
  try {
    const service = await Service.findById(req.params.id);
    if (!service) return res.status(404).json({ message: "Service not found" });
    res.json(service);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});


app.post("/services", uploadService.single("photo"), async (req, res) => {
  try {
    const service = new Service({
      name: req.body.name,
      description: req.body.description,
      duration: req.body.duration,
      price: req.body.price,
      status: req.body.status,
      photo: req.file ? req.file.filename : "",
    });

    await service.save();
    res.json(service);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});


app.put("/services/:id", uploadService.single("photo"), async (req, res) => {
  try {
    const updatedData = {
      name: req.body.name,
      description: req.body.description,
      duration: req.body.duration,
      price: req.body.price,
      status: req.body.status,
    };

    if (req.file) {
      updatedData.photo = req.file.filename;
    }

    const service = await Service.findByIdAndUpdate(req.params.id, updatedData, {
      new: true,
    });

    if (!service) return res.status(404).json({ message: "Service not found" });

    res.json(service);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// DELETE service
app.delete("/services/:id", async (req, res) => {
  try {
    const service = await Service.findByIdAndDelete(req.params.id);
    if (!service) return res.status(404).json({ message: "Service not found" });

    res.json({ message: "Service deleted successfully" });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});
/* ================== BLOG ROUTES ================== */


app.post("/blogs", blogUpload.single("image"), async (req, res) => {
  try {
    const { title, author, date, content, status } = req.body;

    const newBlog = new Blog({
      title,
      author,
      date,
      content,
      status,
      image: req.file ? req.file.filename : "",
    });

    await newBlog.save();
    res.status(201).json(newBlog);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});


app.get("/blogs", async (req, res) => {
  try {
    const blogs = await Blog.find().sort({ createdAt: 1 });

    
    const blogsWithCounts = await Promise.all(
      blogs.map(async (blog) => {
        const count = await Comment.countDocuments({ blogId: blog._id });

        return {
          ...blog.toObject(),
          commentCount: count,
        };
      })
    );

    res.json(blogsWithCounts);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

/* ✅ Get Blog By ID (GET) */
app.get("/blogs/:id", async (req, res) => {
  try {
    const blog = await Blog.findById(req.params.id);

    if (!blog) return res.status(404).json({ message: "Blog not found" });

    // Count comments for this blog
    const count = await Comment.countDocuments({ blogId: blog._id });

    res.json({
      ...blog.toObject(),
      commentCount: count,
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

/* ✅ Update Blog (PUT) */
app.put("/blogs/:id", blogUpload.single("image"), async (req, res) => {
  try {
    const { title, author, date, content, status } = req.body;

    const blog = await Blog.findById(req.params.id);
    if (!blog) return res.status(404).json({ message: "Blog not found" });

    blog.title = title;
    blog.author = author;
    blog.date = date;
    blog.content = content;
    blog.status = status;

    
    if (req.file) {
      blog.image = req.file.filename;
    }

    await blog.save();
    res.json(blog);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});


app.delete("/blogs/:id", async (req, res) => {
  try {
    const deletedBlog = await Blog.findByIdAndDelete(req.params.id);

    if (!deletedBlog)
      return res.status(404).json({ message: "Blog not found" });

    res.json({ message: "Blog deleted successfully" });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

/* ================= DASHBOARD STATS ================= */
app.get("/api/dashboard/stats", async (req, res) => {
  try {
    const appointments = await Appointment.countDocuments();
    const patients = await Appointment.distinct("email").then(emails => emails.length);
    const doctors = await Doctor.countDocuments({ status: "Available" });
    const doctorsOnLeave = await Doctor.countDocuments({ status: { $ne: "Available" } });

    res.json({
      appointments,
      patients,
      doctors,
      doctorsOnLeave,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Error fetching dashboard stats" });
  }
});
app.post("/contact", async (req, res) => {
  try {
    const { name, email, subject, message } = req.body;

    const transporter = nodemailer.createTransport({
      service: "gmail",
      auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS,
      },
    });

    await transporter.sendMail({
      from: email,
      to: process.env.EMAIL_USER, 
      subject: subject,
      text: `
        Name: ${name}
        Email: ${email}
        
        Message:
        ${message}
      `,
    });

    res.json({ message: "Message sent successfully! " });

  } catch (error) {
    console.log(error);
    res.status(500).json({ message: "Error sending message" });
  }
});



/* ================== BLOG COMMENTS ROUTES ================== */

// GET comments for a blog
app.get("/blogs/:id/comments", async (req, res) => {
  try {
    const comments = await Comment.find({ blogId: req.params.id }).sort({
      createdAt: -1,
    });
    res.json(comments);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// POST new comment
app.post("/blogs/:id/comments", async (req, res) => {
  try {
    const { name, message } = req.body;

    const newComment = new Comment({
      blogId: req.params.id,
      name,
      message,
    });

    await newComment.save();
    res.status(201).json(newComment);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

/* ================= SERVER ================= */
app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
