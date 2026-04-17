const express = require('express');
const bodyParser = require('body-parser');
const path = require('path');
const multer = require('multer');
const { Sequelize, DataTypes } = require('sequelize');
const { S3Client, PutObjectCommand } = require('@aws-sdk/client-s3');

const app = express();

// Konfigurasi Database RDS
const sequelize = new Sequelize('db_lks', 'admin', 'adminadmin', {
    host: 'db-wk.cdkw2w4ci2en.us-east-1.rds.amazonaws.com',
    dialect: 'mysql',
    port: 3306,
    logging: false
});

// Konfigurasi S3
const s3Client = new S3Client({
    region: 'us-east-1'
});

const BUCKET_NAME = 'tech-nova-files-123';

// Setup multer untuk upload file (memory storage)
const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 5 * 1024 * 1024 }, // 5MB
    fileFilter: (req, file, cb) => {
        const allowedTypes = ['image/jpeg', 'image/png', 'image/jpg', 'image/gif'];
        if (allowedTypes.includes(file.mimetype)) {
            cb(null, true);
        } else {
            cb(new Error('Hanya file gambar yang diperbolehkan'));
        }
    }
});

// Model User
const User = sequelize.define('User', {
    id: {
        type: DataTypes.INTEGER,
        autoIncrement: true,
        primaryKey: true
    },
    nama: {
        type: DataTypes.STRING,
        allowNull: false
    },
    alamat: {
        type: DataTypes.TEXT,
        allowNull: false
    },
    asal_sekolah: {
        type: DataTypes.STRING,
        allowNull: false
    },
    foto_url: {
        type: DataTypes.STRING,
        allowNull: true
    }
}, {
    tableName: 'biodata',
    timestamps: true,
    underscored: true
});

// Setup
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.use(express.static('public'));
app.use(bodyParser.urlencoded({ extended: false }));
app.use(bodyParser.json());

// Fungsi upload ke S3
async function uploadToS3(file, originalName) {
    const extension = path.extname(originalName);
    const key = `${Date.now()}_${Math.random().toString(36).substring(2, 15)}${extension}`;
    
    const command = new PutObjectCommand({
        Bucket: BUCKET_NAME,
        Key: key,
        Body: file.buffer,
        ContentType: file.mimetype,
        ACL: 'public-read'
    });
    
    await s3Client.send(command);
    return `https://${BUCKET_NAME}.s3.${s3Client.config.region}.amazonaws.com/${key}`;
}

// Route Home - Menampilkan semua data
app.get('/', async (req, res) => {
    try {
        const users = await User.findAll({
            order: [['id', 'DESC']]
        });
        res.render('index', { users: users });
    } catch (error) {
        console.error('Error:', error.message);
        res.render('index', { users: [] });
    }
});

// Route Form Tambah Data
app.get('/add', (req, res) => {
    res.render('form', { 
        message: null, 
        messageType: null, 
        uploadedPhoto: null 
    });
});

// Route Proses Tambah Data (dengan upload foto)
app.post('/add', upload.single('foto'), async (req, res) => {
    const { nama, alamat, asal_sekolah } = req.body;
    
    if (!nama || !alamat || !asal_sekolah) {
        return res.render('form', { 
            message: 'Semua field harus diisi!', 
            messageType: 'error',
            uploadedPhoto: null 
        });
    }
    
    if (!req.file) {
        return res.render('form', { 
            message: 'Foto harus diupload!', 
            messageType: 'error',
            uploadedPhoto: null 
        });
    }
    
    try {
        // Upload foto ke S3
        const fotoUrl = await uploadToS3(req.file, req.file.originalname);
        
        // Simpan ke database
        await User.create({
            nama: nama,
            alamat: alamat,
            asal_sekolah: asal_sekolah,
            foto_url: fotoUrl
        });
        
        res.render('form', {
            message: 'Data berhasil disimpan!',
            messageType: 'success',
            uploadedPhoto: fotoUrl
        });
    } catch (error) {
        console.error('Error:', error.message);
        res.render('form', {
            message: 'Gagal menyimpan: ' + error.message,
            messageType: 'error',
            uploadedPhoto: null
        });
    }
});

// Route Form Edit Data
app.get('/edit/:id', async (req, res) => {
    try {
        const user = await User.findByPk(req.params.id);
        if (!user) {
            return res.redirect('/');
        }
        res.render('edit', { user: user, message: null, messageType: null });
    } catch (error) {
        res.redirect('/');
    }
});

// Route Proses Edit Data (dengan upload foto optional)
app.post('/edit/:id', upload.single('foto'), async (req, res) => {
    const { nama, alamat, asal_sekolah } = req.body;
    
    try {
        const updateData = { nama, alamat, asal_sekolah };
        
        // Jika upload foto baru
        if (req.file) {
            const fotoUrl = await uploadToS3(req.file, req.file.originalname);
            updateData.foto_url = fotoUrl;
        }
        
        await User.update(updateData, {
            where: { id: req.params.id }
        });
        
        res.redirect('/');
    } catch (error) {
        res.redirect('/');
    }
});

// Route Hapus Data
app.get('/delete/:id', async (req, res) => {
    try {
        await User.destroy({ where: { id: req.params.id } });
        res.redirect('/');
    } catch (error) {
        res.redirect('/');
    }
});

// Start Server
const PORT = 3000;

async function startServer() {
    try {
        await sequelize.authenticate();
        console.log('✅ Database connected to RDS');
        await sequelize.sync();
        console.log('✅ Table synced');
        
        const count = await User.count();
        console.log('📊 Total data: ' + count + ' rows');
        
        app.listen(PORT, '0.0.0.0', () => {
            console.log('\n🚀 Server running on http://localhost:' + PORT);
            console.log('📝 Open in browser: http://localhost:' + PORT + '\n');
        });
    } catch (error) {
        console.error('❌ Database error:', error.message);
        app.listen(PORT, '0.0.0.0', () => {
            console.log('\n🚀 Server running on http://localhost:' + PORT);
            console.log('⚠️  Database connection failed\n');
        });
    }
}

startServer();
