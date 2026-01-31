const express = require('express');
const cors = require('cors');
const fs = require('fs').promises;
const path = require('path');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

const app = express();
const PORT = process.env.PORT || 3005;
const SECRET_KEY = 'beaver-farm-secret-key-2023';
const USERS_DIR = path.join(__dirname, 'users');
const LOGIN_EXPIRY_DAYS = 30; // 30天登录有效期

// 获取本机IP地址
const os = require('os');
function getLocalIP() {
    const interfaces = os.networkInterfaces();
    for (const name of Object.keys(interfaces)) {
        for (const iface of interfaces[name]) {
            if (iface.family === 'IPv4' && !iface.internal) {
                return iface.address;
            }
        }
    }
    return 'localhost';
}

const LOCAL_IP = getLocalIP();

// CORS配置
app.use(cors({
    origin: true,
    credentials: true
}));

app.use(express.json());
app.use(express.static(path.join(__dirname, '../frontend')));

// 确保用户目录存在
fs.mkdir(USERS_DIR, { recursive: true }).catch(console.error);

// 加载作物数据
let cropsData = [];
try {
    cropsData = require('./crops.json');
} catch (e) {
    console.error('加载作物数据失败:', e);
}

// 加载菜谱数据
let recipesData = [];
try {
    recipesData = require('./recipes.json');
} catch (e) {
    console.error('加载菜谱数据失败:', e);
}

// 验证token中间件（增加过期检查）
const authenticateToken = async (req, res, next) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];
    
    if (!token) return res.status(401).json({ error: '需要登录' });
    
    try {
        const user = jwt.verify(token, SECRET_KEY);
        
        // 检查用户是否存在
        const userFile = path.join(USERS_DIR, `${user.username}.json`);
        try {
            await fs.access(userFile);
        } catch {
            return res.status(403).json({ error: '用户不存在' });
        }
        
        // 检查最后登录时间是否超过30天
        const userData = JSON.parse(await fs.readFile(userFile, 'utf8'));
        if (userData.lastLogin) {
            const lastLoginDate = new Date(userData.lastLogin);
            const currentDate = new Date();
            const daysDiff = Math.floor((currentDate - lastLoginDate) / (1000 * 60 * 60 * 24));
            
            if (daysDiff > LOGIN_EXPIRY_DAYS) {
                return res.status(403).json({ error: '登录已过期，请重新登录' });
            }
        }
        
        req.user = user;
        next();
    } catch (err) {
        if (err.name === 'TokenExpiredError') {
            return res.status(403).json({ error: '登录已过期，请重新登录' });
        }
        return res.status(403).json({ error: 'token无效' });
    }
};

// 1. 用户注册（独立API）
app.post('/api/register', async (req, res) => {
    try {
        const { username, password } = req.body;
        
        if (!username || !password) {
            return res.status(400).json({ error: '用户名和密码不能为空' });
        }
        
        if (username.length < 3 || username.length > 20) {
            return res.status(400).json({ error: '用户名长度3-20个字符' });
        }
        
        if (password.length < 6) {
            return res.status(400).json({ error: '密码至少6个字符' });
        }
        
        const userFile = path.join(USERS_DIR, `${username}.json`);
        
        try {
            await fs.access(userFile);
            return res.status(400).json({ error: '用户名已存在' });
        } catch {
            // 文件不存在，可以注册
        }
        
        const hashedPassword = await bcrypt.hash(password, 10);
        
        const userData = {
            username,
            password: hashedPassword,
            habits: [],
            crops: [],
            storage: {},
            discoveredRecipes: [],
            habitStreak: 0,
            totalHarvests: 0,
            maxHabits: 3,
            createdAt: new Date().toISOString(),
            lastLogin: new Date().toISOString() // 记录注册时间作为首次登录
        };
        
        await fs.writeFile(userFile, JSON.stringify(userData, null, 2));
        
        // 注册成功后不自动登录，需要用户去登录页面
        res.json({ 
            success: true,
            message: '注册成功，请前往登录页面登录'
        });
    } catch (error) {
        console.error('注册错误:', error);
        res.status(500).json({ error: '注册失败' });
    }
});

// 2. 用户登录（独立API）
app.post('/api/login', async (req, res) => {
    try {
        const { username, password } = req.body;
        
        if (!username || !password) {
            return res.status(400).json({ error: '用户名和密码不能为空' });
        }
        
        const userFile = path.join(USERS_DIR, `${username}.json`);
        
        try {
            await fs.access(userFile);
        } catch {
            return res.status(404).json({ error: '用户不存在' });
        }
        
        const userData = JSON.parse(await fs.readFile(userFile, 'utf8'));
        const validPassword = await bcrypt.compare(password, userData.password);
        
        if (!validPassword) {
            return res.status(401).json({ error: '密码错误' });
        }
        
        // 检查是否超过30天未登录
        if (userData.lastLogin) {
            const lastLoginDate = new Date(userData.lastLogin);
            const currentDate = new Date();
            const daysDiff = Math.floor((currentDate - lastLoginDate) / (1000 * 60 * 60 * 24));
            
            if (daysDiff > LOGIN_EXPIRY_DAYS) {
                // 可以在这里添加额外逻辑，比如发送重新登录提示
                console.log(`用户 ${username} 已 ${daysDiff} 天未登录`);
            }
        }
        
        // 更新最后登录时间
        userData.lastLogin = new Date().toISOString();
        await fs.writeFile(userFile, JSON.stringify(userData, null, 2));
        
        const token = jwt.sign({ username }, SECRET_KEY, { expiresIn: '30d' });
        
        res.json({ 
            success: true, 
            token, 
            username,
            maxHabits: userData.maxHabits || 3
        });
    } catch (error) {
        console.error('登录错误:', error);
        res.status(500).json({ error: '登录失败' });
    }
});

// 3. 自动登录验证（检查30天有效期）
app.post('/api/auto-login', authenticateToken, async (req, res) => {
    try {
        const username = req.user.username;
        const userFile = path.join(USERS_DIR, `${username}.json`);
        
        const userData = JSON.parse(await fs.readFile(userFile, 'utf8'));
        
        // 更新最后登录时间
        userData.lastLogin = new Date().toISOString();
        await fs.writeFile(userFile, JSON.stringify(userData, null, 2));
        
        res.json({ 
            success: true, 
            username,
            maxHabits: userData.maxHabits || 3
        });
    } catch (error) {
        console.error('自动登录错误:', error);
        res.status(500).json({ error: '自动登录失败' });
    }
});

// 4. 用户退出（清除token）
app.post('/api/logout', authenticateToken, async (req, res) => {
    try {
        // 这里可以添加退出逻辑，比如记录退出时间
        const username = req.user.username;
        const userFile = path.join(USERS_DIR, `${username}.json`);
        
        const userData = JSON.parse(await fs.readFile(userFile, 'utf8'));
        userData.lastLogout = new Date().toISOString();
        await fs.writeFile(userFile, JSON.stringify(userData, null, 2));
        
        res.json({ 
            success: true,
            message: '退出成功'
        });
    } catch (error) {
        console.error('退出错误:', error);
        res.status(500).json({ error: '退出失败' });
    }
});

// 5. 获取用户最后登录时间
app.get('/api/last-login', authenticateToken, async (req, res) => {
    try {
        const username = req.user.username;
        const userFile = path.join(USERS_DIR, `${username}.json`);
        
        const userData = JSON.parse(await fs.readFile(userFile, 'utf8'));
        
        res.json({ 
            success: true,
            lastLogin: userData.lastLogin || userData.createdAt,
            createdAt: userData.createdAt
        });
    } catch (error) {
        console.error('获取登录时间错误:', error);
        res.status(500).json({ error: '获取失败' });
    }
});

// 4. 获取作物数据
app.get('/api/crops', authenticateToken, (req, res) => {
    res.json({ success: true, crops: cropsData });
});

// 5. 获取菜谱数据
app.get('/api/recipes', authenticateToken, (req, res) => {
    res.json({ success: true, recipes: recipesData });
});

// 6. 获取用户数据
app.get('/api/user-data', authenticateToken, async (req, res) => {
    try {
        const username = req.user.username;
        const userFile = path.join(USERS_DIR, `${username}.json`);
        
        const userData = JSON.parse(await fs.readFile(userFile, 'utf8'));
        
        // 不返回密码
        delete userData.password;
        
        res.json({ success: true, data: userData });
    } catch (error) {
        console.error('获取用户数据错误:', error);
        res.status(500).json({ error: '获取用户数据失败' });
    }
});

// 7. 保存用户数据
app.post('/api/save-data', authenticateToken, async (req, res) => {
    try {
        const username = req.user.username;
        const userFile = path.join(USERS_DIR, `${username}.json`);
        
        const userData = JSON.parse(await fs.readFile(userFile, 'utf8'));
        
        // 更新用户数据
        const updates = req.body;
        Object.assign(userData, updates);
        
        await fs.writeFile(userFile, JSON.stringify(userData, null, 2));
        
        res.json({ success: true });
    } catch (error) {
        console.error('保存数据错误:', error);
        res.status(500).json({ error: '保存数据失败' });
    }
});

// 8. 添加新习惯
app.post('/api/add-habit', authenticateToken, async (req, res) => {
    try {
        const username = req.user.username;
        const userFile = path.join(USERS_DIR, `${username}.json`);
        
        const userData = JSON.parse(await fs.readFile(userFile, 'utf8'));
        const { habitName } = req.body;
        
        // 检查习惯数量限制
        if (userData.habits.length >= userData.maxHabits) {
            return res.status(400).json({ error: `最多只能添加${userData.maxHabits}个习惯` });
        }
        
        const newHabit = {
            id: `habit_${Date.now()}`,
            name: habitName,
            streak: 0,
            totalCompletions: 0,
            lastCompleted: null,
            createdAt: new Date().toISOString()
        };
        
        userData.habits.push(newHabit);
        await fs.writeFile(userFile, JSON.stringify(userData, null, 2));
        
        res.json({ success: true, habit: newHabit });
    } catch (error) {
        console.error('添加习惯错误:', error);
        res.status(500).json({ error: '添加习惯失败' });
    }
});

// 9. 打卡习惯
app.post('/api/checkin-habit', authenticateToken, async (req, res) => {
    try {
        const username = req.user.username;
        const userFile = path.join(USERS_DIR, `${username}.json`);
        
        const userData = JSON.parse(await fs.readFile(userFile, 'utf8'));
        const { habitId } = req.body;
        
        const habit = userData.habits.find(h => h.id === habitId);
        if (!habit) {
            return res.status(404).json({ error: '习惯不存在' });
        }
        
        const today = new Date().toDateString();
        const lastCompleted = habit.lastCompleted ? new Date(habit.lastCompleted).toDateString() : null;
        
        // 检查今天是否已经打卡
        if (lastCompleted === today) {
            return res.status(400).json({ error: '今天已经打卡过了' });
        }
        
        // 更新习惯数据
        habit.totalCompletions++;
        habit.lastCompleted = new Date().toISOString();
        
        // 更新连续打卡天数
        if (lastCompleted && isYesterday(lastCompleted)) {
            habit.streak++;
        } else {
            habit.streak = 1;
        }
        
        // 更新用户总连续天数
        userData.habitStreak = Math.max(userData.habitStreak, habit.streak);
        
        // 更新作物生长进度
        if (userData.crops && userData.crops.length > 0) {
            const currentCrop = userData.crops[0]; // 当前种植的作物
            if (currentCrop && !currentCrop.harvested) {
                currentCrop.currentGrowth++;
                
                // 检查是否成熟
                const cropData = cropsData.find(c => c.id === currentCrop.id);
                if (cropData && currentCrop.currentGrowth >= cropData.growthTime) {
                    currentCrop.harvested = true;
                    currentCrop.harvestedAt = new Date().toISOString();
                }
            }
        }
        
        await fs.writeFile(userFile, JSON.stringify(userData, null, 2));
        
        res.json({ 
            success: true, 
            habit, 
            habitStreak: userData.habitStreak 
        });
    } catch (error) {
        console.error('打卡错误:', error);
        res.status(500).json({ error: '打卡失败' });
    }
});

// 10. 种植作物
app.post('/api/plant-crop', authenticateToken, async (req, res) => {
    try {
        const username = req.user.username;
        const userFile = path.join(USERS_DIR, `${username}.json`);
        
        const userData = JSON.parse(await fs.readFile(userFile, 'utf8'));
        const { cropId } = req.body;
        
        // 检查是否已经有作物在种植
        if (userData.crops && userData.crops.length > 0) {
            const currentCrop = userData.crops[0];
            if (!currentCrop.harvested) {
                return res.status(400).json({ error: '已经有作物在种植中' });
            }
        }
        
        const cropData = cropsData.find(c => c.id === cropId);
        if (!cropData) {
            return res.status(404).json({ error: '作物不存在' });
        }
        
        const newCrop = {
            id: cropId,
            plantedAt: new Date().toISOString(),
            currentGrowth: 0,
            harvested: false,
            harvestedAt: null
        };
        
        // 只保留最新的作物
        userData.crops = [newCrop];
        await fs.writeFile(userFile, JSON.stringify(userData, null, 2));
        
        res.json({ success: true, crop: newCrop });
    } catch (error) {
        console.error('种植作物错误:', error);
        res.status(500).json({ error: '种植作物失败' });
    }
});

// 11. 放弃作物
app.post('/api/abandon-crop', authenticateToken, async (req, res) => {
    try {
        const username = req.user.username;
        const userFile = path.join(USERS_DIR, `${username}.json`);
        
        const userData = JSON.parse(await fs.readFile(userFile, 'utf8'));
        
        // 检查是否有作物在种植
        if (!userData.crops || userData.crops.length === 0) {
            return res.status(400).json({ error: '没有作物在种植' });
        }
        
        const currentCrop = userData.crops[0];
        if (currentCrop.harvested) {
            return res.status(400).json({ error: '作物已收获' });
        }
        
        // 标记为已收获（实际上是被放弃）
        currentCrop.harvested = true;
        currentCrop.harvestedAt = new Date().toISOString();
        currentCrop.abandoned = true;
        
        await fs.writeFile(userFile, JSON.stringify(userData, null, 2));
        
        res.json({ 
            success: true, 
            message: '作物已放弃',
            abandonedCrop: currentCrop 
        });
    } catch (error) {
        console.error('放弃作物错误:', error);
        res.status(500).json({ error: '放弃作物失败' });
    }
});

// 11. 收获作物
app.post('/api/harvest-crop', authenticateToken, async (req, res) => {
    try {
        const username = req.user.username;
        const userFile = path.join(USERS_DIR, `${username}.json`);
        
        const userData = JSON.parse(await fs.readFile(userFile, 'utf8'));
        
        if (!userData.crops || userData.crops.length === 0) {
            return res.status(400).json({ error: '没有作物可以收获' });
        }
        
        const currentCrop = userData.crops[0];
        if (currentCrop.harvested) {
            return res.status(400).json({ error: '作物已经收获过了' });
        }
        
        const cropData = cropsData.find(c => c.id === currentCrop.id);
        if (!cropData) {
            return res.status(404).json({ error: '作物数据不存在' });
        }
        
        // 检查是否成熟
        if (currentCrop.currentGrowth < cropData.growthTime) {
            return res.status(400).json({ error: '作物还未成熟' });
        }
        
        // 收获作物
        currentCrop.harvested = true;
        currentCrop.harvestedAt = new Date().toISOString();
        
        // 更新仓库
        const cropId = currentCrop.id;
        userData.storage[cropId] = (userData.storage[cropId] || 0) + cropData.harvestAmount;
        userData.totalHarvests = (userData.totalHarvests || 0) + 1;
        
        await fs.writeFile(userFile, JSON.stringify(userData, null, 2));
        
        res.json({ 
            success: true, 
            harvestedAmount: cropData.harvestAmount,
            storage: userData.storage
        });
    } catch (error) {
        console.error('收获作物错误:', error);
        res.status(500).json({ error: '收获作物失败' });
    }
});

// 12. 研发菜谱（改进版）
app.post('/api/research-recipe', authenticateToken, async (req, res) => {
    try {
        const username = req.user.username;
        const userFile = path.join(USERS_DIR, `${username}.json`);
        
        const userData = JSON.parse(await fs.readFile(userFile, 'utf8'));
        const { recipeId, usedIngredients } = req.body;
        
        const recipeData = recipesData.find(r => r.id === recipeId);
        if (!recipeData) {
            return res.status(404).json({ error: '菜谱不存在' });
        }
        
        // 检查是否已经解锁
        if (userData.discoveredRecipes.includes(recipeId)) {
            return res.status(400).json({ error: '菜谱已经解锁' });
        }
        
        // 获取研发历史，用于控制线索显示
        const researchHistory = userData.researchHistory || {};
        if (!researchHistory[recipeId]) {
            researchHistory[recipeId] = {
                attempts: 0,
                revealedClues: 0
            };
        }
        
        researchHistory[recipeId].attempts += 1;
        
        // 检查用户尝试的材料是否正确
        const isCorrect = checkRecipeIngredients(recipeData, usedIngredients);
        
        if (isCorrect) {
            // 检查材料是否足够
            const missingMaterials = [];
            for (const ing of recipeData.ingredients) {
                if ((userData.storage[ing.cropId] || 0) < ing.quantity) {
                    const crop = cropsData.find(c => c.id === ing.cropId);
                    missingMaterials.push(`${crop.name} 需要 ${ing.quantity}个，你只有 ${userData.storage[ing.cropId] || 0}个`);
                }
            }
            
            if (missingMaterials.length > 0) {
                return res.status(400).json({ 
                    success: false,
                    message: '材料不足',
                    missing: missingMaterials
                });
            }
            
            // 扣除材料
            for (const ing of recipeData.ingredients) {
                userData.storage[ing.cropId] -= ing.quantity;
                if (userData.storage[ing.cropId] <= 0) {
                    delete userData.storage[ing.cropId];
                }
            }
            
            // 解锁菜谱
            userData.discoveredRecipes.push(recipeId);
            
            // 每解锁一个菜谱，增加一个习惯位
            userData.maxHabits = Math.min(10, 3 + userData.discoveredRecipes.length);
            
            // 更新研发历史
            researchHistory[recipeId].success = true;
            researchHistory[recipeId].unlockedAt = new Date().toISOString();
            userData.researchHistory = researchHistory;
            
            await fs.writeFile(userFile, JSON.stringify(userData, null, 2));
            
            res.json({ 
                success: true, 
                recipe: {
                    id: recipeData.id,
                    name: recipeData.name,
                    icon: recipeData.icon,
                    description: recipeData.hints[0],
                    ingredients: recipeData.ingredients
                },
                storage: userData.storage,
                maxHabits: userData.maxHabits
            });
            
        } else {
            // 研发失败，给予线索
            const currentAttempts = researchHistory[recipeId].attempts;
            const revealedClues = researchHistory[recipeId].revealedClues;
            
            // 根据尝试次数逐渐揭示线索
            let clue = "";
            let hint = "";
            
            if (currentAttempts === 1) {
                // 第一次尝试：给予通用提示
                clue = "尝试不同的材料组合。需要的材料种类：" + recipeData.ingredients.length + "种";
            } else if (currentAttempts === 2) {
                // 第二次尝试：给予数量提示
                const totalItems = recipeData.ingredients.reduce((sum, ing) => sum + ing.quantity, 0);
                clue = `总食材数量：${totalItems}个`;
                researchHistory[recipeId].revealedClues = 1;
            } else if (currentAttempts === 3) {
                // 第三次尝试：给予具体线索
                clue = recipeData.clues?.[0] || "继续探索吧！";
                researchHistory[recipeId].revealedClues = 2;
            } else if (currentAttempts >= 4) {
                // 后续尝试：逐渐揭示更多线索
                const clueIndex = Math.min(revealedClues, (recipeData.clues?.length || 1) - 1);
                clue = recipeData.clues?.[clueIndex] || "仔细观察材料库存的变化";
                researchHistory[recipeId].revealedClues = revealedClues + 1;
            }
            
            // 添加难度提示
            hint = `难度：${"★".repeat(recipeData.difficulty)}`;
            
            // 添加库存对比提示
            const requiredCrops = recipeData.ingredients.map(ing => ing.cropId);
            const overlap = usedIngredients.filter(item => requiredCrops.includes(item)).length;
            
            if (usedIngredients.length > 0) {
                if (overlap > 0) {
                    clue += ` (已有 ${overlap}/${requiredCrops.length} 种正确材料)`;
                } else {
                    clue += " (当前没有正确材料)";
                }
            }
            
            userData.researchHistory = researchHistory;
            await fs.writeFile(userFile, JSON.stringify(userData, null, 2));
            
            res.json({ 
                success: false,
                message: '研发失败，继续探索吧！',
                clue: clue,
                hint: hint,
                attempts: currentAttempts,
                progress: Math.min(100, (revealedClues / 3) * 100)
            });
        }
        
    } catch (error) {
        console.error('研发菜谱错误:', error);
        res.status(500).json({ error: '研发菜谱失败' });
    }
});

// 改进的配方检查函数
function checkRecipeIngredients(recipe, usedIngredients) {
    if (!usedIngredients || !Array.isArray(usedIngredients)) return false;
    
    // 检查材料种类是否匹配
    const requiredCrops = recipe.ingredients.map(ing => ing.cropId);
    
    // 用户选择的材料必须包含所有需要的材料种类
    if (usedIngredients.length < requiredCrops.length) {
        return false;
    }
    
    // 检查是否包含了所有需要的材料种类
    for (const cropId of requiredCrops) {
        if (!usedIngredients.includes(cropId)) {
            return false;
        }
    }
    
    // 检查是否选择了多余的材料（可选，如果允许额外材料则注释掉）
    if (usedIngredients.length > requiredCrops.length) {
        return false; // 不允许额外材料
    }
    
    return true;
}

// 13. 获取研发历史
app.get('/api/research-history', authenticateToken, async (req, res) => {
    try {
        const username = req.user.username;
        const userFile = path.join(USERS_DIR, `${username}.json`);
        
        const userData = JSON.parse(await fs.readFile(userFile, 'utf8'));
        
        res.json({
            success: true,
            history: userData.researchHistory || {}
        });
    } catch (error) {
        console.error('获取研发历史错误:', error);
        res.status(500).json({ error: '获取研发历史失败' });
    }
});

// 辅助函数：检查是否是昨天
function isYesterday(dateString) {
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    return yesterday.toDateString() === dateString;
}

// 添加页面路由
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, '../frontend/index.html'));
});

app.get('/login', (req, res) => {
    res.sendFile(path.join(__dirname, '../frontend/login.html'));
});

app.get('/register', (req, res) => {
    res.sendFile(path.join(__dirname, '../frontend/register.html'));
});

app.get('/main', (req, res) => {
    res.sendFile(path.join(__dirname, '../frontend/main.html'));
});

app.get('/crops', (req, res) => {
    res.sendFile(path.join(__dirname, '../frontend/crops.html'));
});

app.get('/recipes', (req, res) => {
    res.sendFile(path.join(__dirname, '../frontend/recipes.html'));
});

// 通配路由，处理前端路由
app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, '../frontend/index.html'));
});

app.listen(PORT, '0.0.0.0', () => {
    console.log('🚀 专注农场系统已启动！');
    console.log('========================================');
    console.log(`📱 本地访问: http://localhost:${PORT}`);
    console.log(`🌐 局域网访问: http://${LOCAL_IP}:${PORT}`);
    console.log('========================================');
    console.log(`🛡️ 登录有效期: ${LOGIN_EXPIRY_DAYS}天`);
    console.log('🔐 注册和登录已分离');
    console.log('👋 所有页面均有退出按钮');
});

