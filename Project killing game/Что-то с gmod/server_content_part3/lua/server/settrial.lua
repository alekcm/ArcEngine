util.AddNetworkString("SetTrial")
util.AddNetworkString("StartPreload")
util.AddNetworkString("SetScrumDebate")
util.AddNetworkString("SetNewTrial")
util.AddNetworkString("OpenAllDoors")
util.AddNetworkString("SetNewCount")
util.AddNetworkString("saveTxtCount")
util.AddNetworkString("loadTxtNewCount")
local newCount = false
local startpreload = false
local userCount = {}
local spriteposrot = {
{Vector(-2294.908447,-4058.647949,160.004852), Angle(0.000,169.176,0)},
{Vector(-2300.590332, -4104.133789, 160.045959), Angle(-0.006, -170.784, 0)},
{Vector(-2280.868164, -4150.823730, 160.008102),Angle(-0.006, -144.912, 0)},
{Vector(-2248.459717, -4183.810059, 160.008102),Angle(-0.006, -124.584, 0)},
{Vector(-2201.112061, -4202.708008, 160.008087), Angle(-0.006, -101.747, 0)},
{Vector(-2152.053223, -4205.572266, 160.008102),Angle(-0.006, -80.099, 0)},
{Vector(-2106.501465, -4183.763184, 160.008087),Angle(-0.006, -57.923, 0)},
{Vector(-2072.356934, -4148.192871, 160.008118),Angle(-0.006, -30.203, 0)},
{Vector(-2050.904053, -4105.161133, 160.008087),Angle(-0.006, -11.063, 0)},
{Vector(-2051.415039, -4052.876709, 160.008087),Angle(-0.006, 16.920, 0)},
{Vector(-2072.901367, -4010.296875, 160.004761),Angle(0.025, 35.927, 0)},
{Vector(-2105.714111, -3974.358887, 160.008102),Angle(-0.006, 52.295, 0)},
{Vector(-2151.388184, -3957.490479, 160.008072),Angle(-0.006, 74.207, 0)},
{Vector(-2200.999268, -3956.350098, 160.008087),Angle(-0.006, 104.568, 0)},
{Vector(-2247.663574, -3972.572754, 160.008087),Angle(-0.006, 125.820, 0)},
{Vector(-2282.294189, -4008.542969, 160.008087),Angle(-0.006, 146.413, 0)}}
local cameraposrot = {
{Vector(-2229.925781, -4072.124756, 167.826447),Angle(-0.000, 166.294, 0.000)},
{Vector(-2228.100586, -4092.220459, 165.141678),Angle(-0.000, -171.924, 0.000)},
{Vector(-2215.830322, -4106.119141, 166.171295),Angle(-0.000, -146.342, 0.000)},
{Vector(-2202.624023, -4117.478027, 165.862793),Angle(0.000, -125.593, 0.000)},
{Vector(-2185.595703, -4125.383789, 164.394287),Angle(-0.000, -102.013, 0.000)},
{Vector(-2167.830566, -4124.351074, 164.117813),Angle(0.000, -80.641, 0.000)},
{Vector(-2146.518311, -4119.819824, 163.190628),Angle(0.000, -59.684, 0.000)},
{Vector(-2134.391602, -4106.665527, 163.975693),Angle(0.000, -35.815, 0.000)},
{Vector(-2124.416016, -4087.881104, 162.691315),Angle(0.000, -15.226, 0.000)},
{Vector(-2126.642822, -4071.785889, 164.397705),Angle(0.000, 10.106, 0.000)},
{Vector(-2134.650391, -4055.468262, 167.409286),Angle(0.000, 33.766, 0.000)},
{Vector(-2150.188232, -4036.439453, 165.667023),Angle(0.000, 53.167, 0.000)},
{Vector(-2169.646484, -4031.617432, 168.502914),Angle(0.000, 74.506, 0.000)},
{Vector(-2185.891846, -4031.288086, 170.168991),Angle(0.000, 99.730, 0.000)},
{Vector(-2203.235840, -4037.441162, 169.884064),Angle(0.000, 122.702, 0.000)},
{Vector(-2218.300537, -4053.549316, 167.973099),Angle(1.487, 142.405, -0)}}
local tableposrot = {
{Vector(-7019.205078, 1501.002930, 2451.659180),Angle(0.001, -22.504, 0)},
{Vector(-7252.826660, 1245.035767, 2451.138184),Angle(0.248, -67.035, -0)},
{Vector(-7563.048828, 1244.482178, 2450.843750),Angle(-0.071, -112.349, -0)},
{Vector(-7778.897461, 1458.210938, 2450.953125),Angle(-0.018, -156.506, 0)},
{Vector(-7019.712891, 1498.611694, 2633.782471),Angle(-0.242, -22.495, -0)},
{Vector(-7254.894531, 1243.733765, 2634.132080),Angle(-0.424, -66.969, 0)},
{Vector(-7563.613770, 1244.716553, 2634.333252),Angle(-0.219, -112.466, 0)},
{Vector(-7780.520508, 1460.769043, 2633.998291),Angle(-0.143, -156.011, -0)},
{Vector(-7783.008301, 2027.772339, 2451.975342),Angle(0.070, 157.488, -0)},
{Vector(-7586.916504, 2238.181396, 2451.603760),Angle(-0.004, 112.999, -0)},
{Vector(-7253.260254, 2248.259766, 2450.901367),Angle(-0.017, 66.995, 0)},
{Vector(-7045.446289, 2056.909180, 2451.119873),Angle(-0.001, 22.021, 0)},
{Vector(-7783.238770, 2027.131104, 2634.270752),Angle(0.007, 157.586, -0)},
{Vector(-7590.178711, 2236.805664, 2633.823730),Angle(0.026, 112.998, -0)},
{Vector(-7252.974121, 2246.765137, 2633.783936),Angle(0.120, 66.993, -0)},
{Vector(-7045.324707, 2054.834717, 2633.385010),Angle(0.017, 22.021, -0)}}

local tableposrotTHH = {
{Vector(128.437500, 1097.468750, 83.312500),Angle(-0.027, 0.016, -0.016)},
{Vector(-128.687500, 1094.156250, 83.656250),Angle(0.000, 180.000, -0.033)},
{Vector(127.812500, 1497.875000, 83.718750),Angle(0.000, -0.038, 0.000)},
{Vector(-128.281250, 1495.343750, 83.250000),Angle(0.000, -179.984, 0.000)},
{Vector(128.000000, 1898.500000, 83.281250),Angle(-0.807, -0.066, -0.033)},
{Vector(-128.687500, 1893.375000, 83.406250),Angle(0.027, 179.995, -0.071)},
{Vector(127.875000, 2298.156250, 82.968750),Angle(0.033, 0.005, 0.126)},
{Vector(-127.687500, 2294.312500, 83.062500),Angle(0.000, 179.890, 0.000)},
{Vector(127.875000, 2697.406250, 83.562500),Angle(-0.005, 0.000, 0.033)},
{Vector(-127.906250, 2694.031250, 83.406250),Angle(0.005, 179.956, 0.022)},
{Vector(127.843750, 3096.562500, 82.968750),Angle(0.000, 0.000, -0.165)},
{Vector(-72.125000, 3295.593750, 83.468750),Angle(-0.027, 89.989, 0.011)},
{Vector(-473.718750, 3296.656250, 83.125000),Angle(0.000, 90.022, 0.000)},
{Vector(-874.406250, 3295.875000, 83.375000),Angle(0.181, 89.962, -0.286)},
{Vector(-1272.500000, 3295.937500, 83.468750),Angle(0.016, 89.995, 0.000)},
{Vector(-1472.531250, 3095.812500, 83.593750),Angle(-0.923, 179.912, 0.110)}}
local scrumleft = {
    {Vector(-1257, -4011, 176),Angle(0, 180, 0)},
    {Vector(-1206, -4011, 176),Angle(0, 180, 0)},
    {Vector(-1155, -4011, 176),Angle(0, 180, 0)},
    {Vector(-1103, -4011, 176),Angle(0, 180, 0)},
    {Vector(-1051, -4011, 176),Angle(0, 180, 0)},
    {Vector(-1000, -4011, 176),Angle(0, 180, 0)},
    {Vector(-948, -4011, 176),Angle(0, 180, 0)},
    {Vector(-897, -4011, 176),Angle(0, 180, 0.)}
}
local scrumright = {
{Vector(-1257, -4082, 176),Angle(0, 0, 0)},
    {Vector(-1206, -4082, 176),Angle(0, 0, 0)},
    {Vector(-1155, -4082, 176),Angle(0, 0, 0)},
    {Vector(-1103, -4082, 176),Angle(0, 0, 0)},
    {Vector(-1051, -4082, 176),Angle(0, 0, 0)},
    {Vector(-1000, -4082, 176),Angle(0, 0, 0)},
    {Vector(-948, -4082, 176),Angle(0, 0, 0)},
    {Vector(-897, -4082, 176),Angle(0, 0, 0.)}
    
}

local spriteposrotTHH = {
{Vector(-127.567413, -2430.312500, -852.693604), Angle(-0.000, 47.884, 0.000)},
{Vector(-161.575134, -2408.354980, -853.840698), Angle(0.000, 68.417, 0.000)},
{Vector(-200.155762, -2401.070557, -853.142456),Angle(-0.000, 88.038, 0.000)},
{Vector(-240.527588, -2409.478271, -853.211731),Angle(-0.000, 113.611, 0.000)},
{Vector(-273.406158, -2432.356201, -853.138184), Angle(0.000, 137.240, 0.000)},
{Vector(-294.788361, -2464.660645, -853.177124),Angle(-0.000, 158.614, 0.000)},
{Vector(-301.064911, -2504.490967, -852.490601),Angle(0.000, 179.579, 0.000)},
{Vector(-294.490845, -2543.775879, -853.047058),Angle(0.000, -161.966, 0.000)},
{Vector(-272.556061, -2578.009277, -853.506287),Angle(-0.000, -136.467, 0.000)},
{Vector(-237.596756, -2597.328857, -853.867493),Angle(0.000, -113.035, 0.000)},
{Vector(-199.105194, -2605.475098, -853.686707),Angle(0.000, -93.848, 0.000)},
{Vector(-159.747467, -2598.906494, -852.742188),Angle(0.000, -66.563, 0.000)},
{Vector(-127.302139, -2575.522949, -853.184326),Angle(0.000, -47.658, 0.000)},
{Vector(-104.773232, -2543.064697, -852.783630),Angle(-0.000, -21.147, 0.000)},
{Vector(-97.535881, -2502.084717, -852.274780),Angle(-0.000, 2.431, 0.000)},
{Vector(-103.548462, -2463.658203, -853.346802),Angle(-0.000, 16.631, 0.000)}}

local newSpriteposrot = {}
local newTrial = false
local monSprite = 0

net.Receive("SetNewCount", function(len,ply)
    newTrial = true
    newSpriteposrot = {}
    monSprite = 0
    local spritesRemove = {}
    for i,v in ipairs(ents.GetAll()) do
        if (v:GetClass() == "sprite") then
            if (monSprite == 0 and #newSpriteposrot == 16) then
                monSprite = {v:GetPos(),v:GetAngles()}
                table.insert(spritesRemove,v)
            end
            if(#newSpriteposrot<16) then
                table.insert(newSpriteposrot,{v:GetPos(),v:GetAngles()})
                table.insert(spritesRemove,v)
            end
        end
    end

    for i,v in ipairs(spritesRemove) do
        v:Remove()
    end

    for k, v in ipairs( ents.FindByClass( "circle_count" ) ) do
        v:Remove()
    end

    local tblSpriteSrot = newSpriteposrot
    if monSprite ~= 0 then
        table.insert(tblSpriteSrot,monSprite)
    end
    net.Start("saveTxtCount")
    net.WriteTable(tblSpriteSrot)
    net.Send(ply)
end)

net.Receive("loadTxtNewCount", function(len,ply)
    newTrial = true
    newSpriteposrot = net.ReadTable()
    if(monSprite == 0 and #newSpriteposrot > 16) then
        monSprite = {newSpriteposrot[17][1],newSpriteposrot[17][2]}
    end
end)

local rightchars = {{"Rantaro","Shuichi"},{},{}}
local leftchars = {{"Rantaro","Miu","Korekiyo"},{},{}}

net.Receive("SetNewTrial", function(len,ply)
    newCount = !newCount
    userCount = net.ReadTable()
    for i=1, #userCount do
        userCount[i][1] = Entity(userCount[i][1])
        userCount[i][2] = Entity(userCount[i][2])
    end
    net.Start("StateSprites")
    net.WriteBool(newCount)
    net.Send(ply)
end)

local sprites = {{},{},{}}
local glcamera
local mk
local mkcamera

net.Receive("SetScrumDebate", function()
    for i = 1, 3 do
           
        if rightchars[2][i] ~= nil and rightchars[2][i]:IsValid() then
            rightchars[2][i]:Remove()
            rightchars[2][i] = nil
        end
        if leftchars[2][i] ~= nil and leftchars[2][i]:IsValid() then
            leftchars[2][i]:Remove()
            leftchars[2][i] = nil
        end
        if rightchars[3][i] ~= nil and rightchars[3][i]:IsValid() then
            rightchars[3][i]:Remove()
            rightchars[3][i] = nil
        end
        if leftchars[3][i] ~= nil and leftchars[3][i]:IsValid() then
            leftchars[3][i]:Remove()
            leftchars[3][i] = nil
        end

local sprite = ents.Create("ScrumDebateSprite")
    leftchars[2][i] = sprite
    sprite:SetPos(scrumleft[i][1])
    sprite:SetAngles(scrumleft[i][2])
    sprite:SetNWString("CharacterName", leftchars[1][i])
    sprite:SetNWString("Side", "Left")
    sprite:Spawn()
    sprite:SetCollisionGroup(20)
    local phys4 = sprite:GetPhysicsObject()
    phys4:EnableMotion(false)
    local camera = ents.Create("char_camera")
    leftchars[3][i] = camera
    camera:SetPos(leftchars[2][i]:GetNWEntity("PlayerCameraPlaceLeft"):GetPos())
    camera:SetAngles(leftchars[2][i]:GetNWEntity("PlayerCameraPlaceLeft"):GetAngles())
    camera:Spawn()
    camera:SetCollisionGroup(20)
    local phys5 = camera:GetPhysicsObject()
    phys5:EnableMotion(false)
    leftchars[2][i]:SetNWEntity("PlayerCamera", rightchars[3][i])
        local sprite = ents.Create("ScrumDebateSprite")
    rightchars[2][i] = sprite
    sprite:SetPos(scrumright[i][1])
    sprite:SetAngles(scrumright[i][2])
    sprite:SetNWString("CharacterName", rightchars[1][i])
    sprite:SetNWString("Side", "Right")
    sprite:Spawn()
    sprite:SetCollisionGroup(20)
    local phys4 = sprite:GetPhysicsObject()
    phys4:EnableMotion(false)
    local camera = ents.Create("char_camera")
    rightchars[3][i] = camera
    camera:SetPos(rightchars[2][i]:GetNWEntity("PlayerCameraPlaceRight"):GetPos())
    camera:SetAngles(rightchars[2][i]:GetNWEntity("PlayerCameraPlaceRight"):GetAngles())
    camera:Spawn()
    camera:SetCollisionGroup(20)
    local phys5 = camera:GetPhysicsObject()
    phys5:EnableMotion(false)
    rightchars[2][i]:SetNWEntity("PlayerCamera", camera)
        end
        local monokuma = ents.Create("Sprite")
    mk = monokuma
    monokuma:SetPos(Vector(-733.223389, -4046.490234, 228.143753))
    monokuma:SetAngles(Angle(0.000, 180, 0.000))
    monokuma:SetNWString("CharacterName", "Monokuma")
    monokuma:Spawn()
    monokuma:SetCollisionGroup(20)
    local phys1 = monokuma:GetPhysicsObject()
    phys1:EnableMotion(false)   
    end)

        local doorsents = {"*180","*187","*194","*200","*208","*220","*227","*229","*145","*138","*131","*124","*173","*165","*158","*152","*293","*573","*575","*104","*117","*379","*114","*460","*108","*536","*230","*493","*525","*547","*741","*751","*755"}
        local doorsentsinto = {"*177","*184","*191","*198","*205","*217","*224","*212","*142","*135","*128","*121","*170","*163","*156","*149","*295","*577","*579","*107","*771","*378","*116","*463","*111","*539","*233","*496","*523","*545","*740","*752","*756"}

        local doorTHH = {"*44","*43","*45","*42","*41","*40","*39","*38","*37","*35","*34","*36","*33","*32","*31","*29"} 

local entstable
local function startDoors()
entstable = ents.GetAll()
	for i = 1, 16 do
        if (game.GetMap()=="dgrv3_ultimateacademy") then
    	    for k,v in ipairs(ents.GetAll()) do
    	    	if entstable[k]:GetModel() == doorsents[i] then
    	    		doorsents[i] = entstable[k]
    	    	end
    	    end
    	    for k,v in ipairs(ents.GetAll()) do
    	    	if entstable[k]:GetModel() == doorsentsinto[i] then
    	    		doorsentsinto[i] = entstable[k]
    	    	end
    	    end
        end
        if (game.GetMap()=="gm_hopespeak") then
            for k,v in ipairs(ents.GetAll()) do
                if entstable[k]:GetModel() == doorTHH[i] then
                    doorTHH[i] = entstable[k]
                end
            end
        end
	end
end

net.Receive("OpenAllDoors", function()
    local entstable = ents.GetAll()
    for k,v in ipairs(ents.GetAll()) do
        if (v:GetClass() == "func_button") then
            v:Fire("Unlock")
            if (v:GetModel() == "*295" or v:GetModel() == "*293" or v:GetModel() == "*573" or v:GetModel() == "*577" or v:GetModel() == "*575" or v:GetModel() == "*579" or v:GetModel() == "*104" or v:GetModel() == "*107" or v:GetModel() == "*117" or v:GetModel() == "*771" or v:GetModel() == "*379" or v:GetModel() == "*114" or v:GetModel() == "*116" or v:GetModel() == "*460" or v:GetModel() == "*463" or v:GetModel() == "*108" or v:GetModel() == "*111" or v:GetModel() == "*378" or v:GetModel() == "*536" or v:GetModel() == "*539" or v:GetModel() == "*230" or v:GetModel() == "*233" or v:GetModel() == "*493" or v:GetModel() == "*496" or v:GetModel() == "*523" or v:GetModel() == "*525" or v:GetModel() == "*547" or v:GetModel() == "*545" or v:GetModel() == "*741" or v:GetModel() == "*740" or v:GetModel() == "*751" or v:GetModel() == "*752" or v:GetModel() == "*755" or v:GetModel() == "*756") or (v:GetModel() =="*180" or v:GetModel() =="*187" or v:GetModel() =="*194" or v:GetModel() =="*200"or v:GetModel() =="*208"or v:GetModel() =="*220"or v:GetModel() =="*227"or v:GetModel() =="*229"or v:GetModel() =="*145"or v:GetModel() =="*138"or v:GetModel() =="*131"or v:GetModel() =="*124"or v:GetModel() =="*173" or v:GetModel() == "*165" or v:GetModel() == "*158" or v:GetModel() == "*152" or v:GetModel() == "*293" or v:GetModel() == "*573" or v:GetModel() == "*575" or v:GetModel() == "*104" or v:GetModel() == "*117" or v:GetModel() == "*379" or v:GetModel() == "*114" or v:GetModel() == "*460" or v:GetModel() == "*108" or v:GetModel() == "*536" or v:GetModel() == "*230" or v:GetModel() == "*493" or v:GetModel() == "*525" or v:GetModel() == "*547" or v:GetModel() == "*741" or v:GetModel() == "*751" or v:GetModel() == "*755") or (v:GetModel() == "*177" or v:GetModel() == "*184" or v:GetModel() == "*191" or v:GetModel() == "*198" or v:GetModel() == "*205" or v:GetModel() == "*217" or v:GetModel() == "*224" or v:GetModel() == "*212" or v:GetModel() == "*142" or v:GetModel() == "*135" or v:GetModel() == "*128" or v:GetModel() == "*121" or v:GetModel() == "*170" or v:GetModel() == "*163" or v:GetModel() == "*156" or v:GetModel() == "*149" or v:GetModel() == "*295" or v:GetModel() == "*577" or v:GetModel() == "*579" or v:GetModel() == "*107" or v:GetModel() == "*771" or v:GetModel() == "*378" or v:GetModel() == "*116" or v:GetModel() == "*463" or v:GetModel() == "*111" or v:GetModel() == "*539" or v:GetModel() == "*233" or v:GetModel() == "*496" or v:GetModel() == "*523" or v:GetModel() == "*545" or v:GetModel() == "*740" or v:GetModel() == "*752" or v:GetModel() == "*756") then
                if (!v:GetSaveTable().m_bLocked) then
                    v:Fire("Lock")
                elseif (v:GetSaveTable().m_bLocked) then
                    v:Fire("Unlock")
                end
            end
        end
        if (v:GetClass() == "func_door_rotating") then
            if (v:GetSaveTable().m_bLocked) then
                v:Fire("Unlock")
            elseif(!v:GetSaveTable().m_bLocked) then
                v:Fire("Lock")
            end
        end

    end
end)

local uy = 0
net.Receive("SetTrial", function ()
    startDoors()
    if(newTrial~=true) then
    	if uy == 0 then
    		local entstable = ents.GetAll()
    		uy = 1
    		for i = 1, 16 do
    	    for k,v in ipairs(ents.GetAll()) do
    	    	if entstable[k]:GetModel() == doorsents[i] then
    	    		doorsents[i] = entstable[k]
    	    	end
    	    end
    	    for k,v in ipairs(ents.GetAll()) do
    	    	if entstable[k]:GetModel() == doorsentsinto[i] then
    	    		doorsentsinto[i] = entstable[k]
    	    	end
    	    end
    	end

    	end
        if glcamera ~= nil and glcamera:IsValid() then
            glcamera:Remove()
            glcamera = nil
        end
        if mk ~= nil and mk:IsValid() then
            mk:Remove()
            mk = nil
        end
        if mkcamera ~= nil and mkcamera:IsValid() then
            mkcamera:Remove()
            mkcamera = nil
        end
            if (game.GetMap()=="dgrv3_ultimateacademy") then
                local globalcamera = ents.Create("global_camera")
                glcamera = globalcamera
                globalcamera:SetPos(Vector(-2372.932373, -3890.636475, 278.406677))
                globalcamera:SetAngles(Angle(0.023, 132.308, 0.004))
                globalcamera:SetCollisionGroup(20)
                local StringMono = net.ReadString()
                if (StringMono ~= nil and StringMono ~= "Empty") then
                    local monokuma = ents.Create("Sprite")
                    mk = monokuma
                    monokuma:SetPos(Vector(-2421.860840, -3834.470703, 305.143738))
                    monokuma:SetAngles(Angle(0.000, 314.112-180, 0.000))
                    monokuma:SetNWString("CharacterName", StringMono)
                    monokuma:Spawn()
                    monokuma:SetCollisionGroup(20)
                    local phys1 = monokuma:GetPhysicsObject()
                    phys1:EnableMotion(false)   
                    local monokumacamera = ents.Create("char_camera")
                    mkcamera = monokumacamera
                    monokumacamera:SetPos(monokuma:GetNWEntity("PlayerCameraPlace"):GetPos())
                    monokumacamera:SetAngles(monokuma:GetNWEntity("PlayerCameraPlace"):GetAngles())
                    monokumacamera:SetNWString("CharacterName", StringMono)
                    monokumacamera:Spawn()
                    monokumacamera:SetCollisionGroup(20)
                    local phys2 = monokumacamera:GetPhysicsObject()
                    phys2:EnableMotion(false)
                    monokuma:SetNWEntity("PlayerCamera", monokumacamera)
                end

                for i = 1, 16 do
    	                doorsents[i]:SetNWString("Owner",CurrentPlayers[1][i])
    	                doorsents[i]:SetNWEntity("Partner",doorsentsinto[i])

    	                doorsentsinto[i]:SetNWString("Owner",CurrentPlayers[1][i])
    	                doorsentsinto[i]:SetNWEntity("Partner",doorsents[i])
                    if sprites[1][i] ~= nil and sprites[1][i]:IsValid() then
                        sprites[1][i]:Remove()
                        sprites[1][i] = nil
                    end
                    if sprites[2][i] ~= nil and sprites[2][i]:IsValid() then
                        sprites[2][i]:Remove()
                        sprites[2][i] = nil
                    end
                    if sprites[3][i] ~= nil and sprites[3][i]:IsValid() then
                        sprites[3][i]:Remove()
                        sprites[3][i] = nil
                    end
                        local camera = ents.Create("room_table")
                sprites[3][i] = camera
                camera:SetPos(tableposrot[i][1])
                camera:SetAngles(tableposrot[i][2])
                if ( CurrentPlayers[1][i] == "Rissi") then
                         camera:SetNWString("CharacterName", "Rissy")   
                else
                camera:SetNWString("CharacterName", CurrentPlayers[1][i])
                end
                camera:Spawn()
                camera:SetCollisionGroup(20)
               
                local phys3 = camera:GetPhysicsObject()
                phys3:EnableMotion(false)
                    if CurrentPlayers[1][i] ~= "Empty" then
                    
                    if CurrentPlayers[2][i] == true then
                local sprite = ents.Create("Sprite")
                sprites[1][i] = sprite
                sprite:SetPos(spriteposrot[i][1])
                sprite:SetAngles(spriteposrot[i][2])
                sprite:SetNWString("CharacterName", CurrentPlayers[1][i])
                sprite:Spawn()
                sprite:SetCollisionGroup(20)
                local phys4 = sprite:GetPhysicsObject()
                phys4:EnableMotion(false)
                local camera = ents.Create("char_camera")
                sprites[2][i] = camera
                --camera:SetPos(cameraposrot[i][1])
                --camera:SetAngles(cameraposrot[i][2])
                camera:SetPos(sprites[1][i]:GetNWEntity("PlayerCameraPlace"):GetPos())
                camera:SetAngles(sprites[1][i]:GetNWEntity("PlayerCameraPlace"):GetAngles())
                camera:SetNWString("CharacterName", CurrentPlayers[1][i])
                camera:Spawn()
                camera:SetCollisionGroup(20)
                local phys5 = camera:GetPhysicsObject()
                phys5:EnableMotion(false)
                --sprites[2][i] = sprites[1][i]:GetNWEntity("PlayerCamera")
                --sprites[2][i]:SetNWString("CharacterName", CurrentPlayers[1][i])
                sprites[1][i]:SetNWEntity("PlayerCamera", camera)
                
            else
                local dead = ents.Create("gmod_button")
                sprites[1][i] = dead
                dead:SetModel("models/models/deadplate/portraitv3.mdl")
                                local tbl = GetNameAndHeight(CurrentPlayers[1][i])
                                local pos = tbl[2]
                dead:SetPos(Vector(spriteposrot[i][1].x,spriteposrot[i][1].y,spriteposrot[i][1].z-62.5+pos*3))
                dead:SetAngles(Angle(spriteposrot[i][2].x,spriteposrot[i][2].y+180,spriteposrot[i][2].z))
                dead:SetSubMaterial(4, "plates/"..CurrentPlayers[1][i])
                if(CurrentPlayers[1][i] == "K1-B0") then
                    dead:SetSubMaterial(4, "plates/k1b0")
                end
                if(CurrentPlayers[1][i] == "Ayumu") then
                    dead:SetSubMaterial(4, "plates/ayumu1")
                end
                if(CurrentPlayers[1][i] == "Sora") then
                    dead:SetSubMaterial(4, "plates/sora1")
                end
                dead:Spawn()
                dead:SetCollisionGroup(20)
                local phys6 = dead:GetPhysicsObject()
                phys6:EnableMotion(false)
            end
            end
                        
            end




            


            local removeents = {"models/props/v3/ryomastand.mdl","*239", "*238","*237","*236","*263","*262","*261","*260","*259","*258","*265","*264","*267","*266","*256","*257","*255","*254","*252","*253","*481","*258","*250","*251","*248","*249","*247","*246","*245","*244","*243","*242","*241","*240","*522","*96","*95","*235","*234"}
                local entstable = ents.GetAll()
                for i,v in ipairs(entstable) do
                    for l,k in ipairs(removeents) do
                        if entstable[i]:GetModel() == k then
                            entstable[i]:Remove()
                        end
                    end
                    if v:GetModel() == entstable then
                        --v:SetUseType("123")
                        --v:UseTriggerBounds(false)
                    end
                end

        end

        if (game.GetMap()=="gm_hopespeak") then
                local globalcamera = ents.Create("global_camera")
                glcamera = globalcamera
                globalcamera:SetCollisionGroup(20)
                local StringMono = net.ReadString()
                if (StringMono ~= nil and StringMono ~= "Empty") then
                    local monokuma = ents.Create("Sprite")
                    mk = monokuma
                    monokuma:SetPos(Vector(-518.577942, -2357.579590, -787.122009))
                    monokuma:SetAngles(Angle(0.000, 156.185, 0.000))
                    monokuma:SetNWString("CharacterName", StringMono)
                    monokuma:Spawn()
                    monokuma:SetCollisionGroup(20)
                    local phys1 = monokuma:GetPhysicsObject()
                    phys1:EnableMotion(false)   
                    local monokumacamera = ents.Create("char_camera")
                    mkcamera = monokumacamera
                    monokumacamera:SetPos(monokuma:GetNWEntity("PlayerCameraPlace"):GetPos())
                    monokumacamera:SetAngles(monokuma:GetNWEntity("PlayerCameraPlace"):GetAngles())
                    monokumacamera:SetNWString("CharacterName", StringMono)
                    monokumacamera:Spawn()
                    monokumacamera:SetCollisionGroup(20)
                    local phys2 = monokumacamera:GetPhysicsObject()
                    phys2:EnableMotion(false)
                    monokuma:SetNWEntity("PlayerCamera", monokumacamera)
                    globalcamera:SetPos(monokumacamera:GetPos())
                    globalcamera:SetAngles(monokumacamera:GetAngles())
                end

                for i = 1, 16 do
                    if sprites[1][i] ~= nil and sprites[1][i]:IsValid() then
                        sprites[1][i]:Remove()
                        sprites[1][i] = nil
                    end
                    if sprites[2][i] ~= nil and sprites[2][i]:IsValid() then
                        sprites[2][i]:Remove()
                        sprites[2][i] = nil
                    end
                    if sprites[3][i] ~= nil and sprites[3][i]:IsValid() then
                        sprites[3][i]:Remove()
                        sprites[3][i] = nil
                    end
                        local camera = ents.Create("room_table_thh")
                sprites[3][i] = camera
                camera:SetPos(tableposrotTHH[i][1])
                camera:SetAngles(tableposrotTHH[i][2])
                if ( CurrentPlayers[1][i] == "Rissi") then
                         camera:SetNWString("CharacterName", "Rissy")   
                else
                camera:SetNWString("CharacterName", CurrentPlayers[1][i])
                end
                camera:SetParent(doorTHH[i])
                camera:Spawn()
                camera:SetCollisionGroup(20)
               
                local phys3 = camera:GetPhysicsObject()
                phys3:EnableMotion(false)
                    if CurrentPlayers[1][i] ~= "Empty" then
                    
                    if CurrentPlayers[2][i] == true then
                local sprite = ents.Create("Sprite")
                sprites[1][i] = sprite
                sprite:SetPos(spriteposrotTHH[i][1])
                sprite:SetAngles(spriteposrotTHH[i][2])
                sprite:SetNWString("CharacterName", CurrentPlayers[1][i])
                sprite:Spawn()
                sprite:SetCollisionGroup(20)
                local phys4 = sprite:GetPhysicsObject()
                phys4:EnableMotion(false)
                local camera = ents.Create("char_camera")
                sprites[2][i] = camera
                --camera:SetPos(cameraposrot[i][1])
                --camera:SetAngles(cameraposrot[i][2])
                camera:SetPos(sprites[1][i]:GetNWEntity("PlayerCameraPlace"):GetPos())
                camera:SetAngles(sprites[1][i]:GetNWEntity("PlayerCameraPlace"):GetAngles())
                camera:SetNWString("CharacterName", CurrentPlayers[1][i])
                camera:Spawn()
                camera:SetCollisionGroup(20)
                local phys5 = camera:GetPhysicsObject()
                phys5:EnableMotion(false)
                --sprites[2][i] = sprites[1][i]:GetNWEntity("PlayerCamera")
                --sprites[2][i]:SetNWString("CharacterName", CurrentPlayers[1][i])
                sprites[1][i]:SetNWEntity("PlayerCamera", camera)
                
            else
                local dead = ents.Create("gmod_button")
                sprites[1][i] = dead
                dead:SetModel("models/models/deadplate/portraitv3.mdl")
                                local tbl = GetNameAndHeight(CurrentPlayers[1][i])
                                local pos = tbl[2]
                dead:SetPos(Vector(spriteposrotTHH[i][1].x,spriteposrotTHH[i][1].y,spriteposrotTHH[i][1].z-62.5+pos*3))
                dead:SetAngles(Angle(spriteposrotTHH[i][2].x,spriteposrotTHH[i][2].y+180,spriteposrotTHH[i][2].z))
                dead:SetSubMaterial(4, "plates/"..CurrentPlayers[1][i])
                if(CurrentPlayers[1][i] == "K1-B0") then
                    dead:SetSubMaterial(4, "plates/k1b0")
                end
                if(CurrentPlayers[1][i] == "Ayumu") then
                    dead:SetSubMaterial(4, "plates/ayumu1")
                end
                if(CurrentPlayers[1][i] == "Sora") then
                    dead:SetSubMaterial(4, "plates/sora1")
                end
                dead:Spawn()
                dead:SetCollisionGroup(20)
                local phys6 = dead:GetPhysicsObject()
                phys6:EnableMotion(false)
            end
            end
                        
            end

        end
    else

        local globalcamera = ents.Create("global_camera")
        glcamera = globalcamera
        local gc = 0
        globalcamera:SetCollisionGroup(20)
        local StringMono = net.ReadString()
        if (StringMono ~= nil and StringMono ~= "Empty" and monSprite ~= 0) then
            local monokuma = ents.Create("Sprite")
            mk = monokuma
            monokuma:SetPos(monSprite[1])
            monokuma:SetAngles(monSprite[2])
            monokuma:SetNWString("CharacterName", StringMono)
            monokuma:Spawn()
            monokuma:SetCollisionGroup(20)
            local phys1 = monokuma:GetPhysicsObject()
            phys1:EnableMotion(false)   
            local monokumacamera = ents.Create("char_camera")
            mkcamera = monokumacamera
            monokumacamera:SetPos(monokuma:GetNWEntity("PlayerCameraPlace"):GetPos())
            monokumacamera:SetAngles(monokuma:GetNWEntity("PlayerCameraPlace"):GetAngles())
            monokumacamera:SetNWString("CharacterName", StringMono)
            monokumacamera:Spawn()
            monokumacamera:SetCollisionGroup(20)
            local phys2 = monokumacamera:GetPhysicsObject()
            phys2:EnableMotion(false)
            monokuma:SetNWEntity("PlayerCamera", monokumacamera)
            globalcamera:SetPos(monokumacamera:GetPos())
            globalcamera:SetAngles(monokumacamera:GetAngles())
            gc = 1
        end

        for i = 1, 16 do
            if sprites[1][i] ~= nil and sprites[1][i]:IsValid() then
                sprites[1][i]:Remove()
                sprites[1][i] = nil
            end
            if sprites[2][i] ~= nil and sprites[2][i]:IsValid() then
                sprites[2][i]:Remove()
                sprites[2][i] = nil
            end
            if sprites[3][i] ~= nil and sprites[3][i]:IsValid() then
                sprites[3][i]:Remove()
                sprites[3][i] = nil
            end
            
            if CurrentPlayers[1][i] ~= "Empty" and i<(#newSpriteposrot+1) then
                if CurrentPlayers[2][i] == true then
                    local sprite = ents.Create("Sprite")
                    sprites[1][i] = sprite
                    sprite:SetPos(newSpriteposrot[i][1])
                    sprite:SetAngles(newSpriteposrot[i][2])
                    sprite:SetNWString("CharacterName", CurrentPlayers[1][i])
                    sprite:Spawn()
                    sprite:SetCollisionGroup(20)
                    local phys4 = sprite:GetPhysicsObject()
                    phys4:EnableMotion(false)
                    local camera = ents.Create("char_camera")
                    sprites[2][i] = camera
                    --camera:SetPos(cameraposrot[i][1])
                    --camera:SetAngles(cameraposrot[i][2])
                    camera:SetPos(sprites[1][i]:GetNWEntity("PlayerCameraPlace"):GetPos())
                    camera:SetAngles(sprites[1][i]:GetNWEntity("PlayerCameraPlace"):GetAngles())
                    camera:SetNWString("CharacterName", CurrentPlayers[1][i])
                    camera:Spawn()
                    camera:SetCollisionGroup(20)
                    if (gc == 0) then
                        globalcamera:SetPos(camera:GetPos())
                        globalcamera:SetAngles(camera:GetAngles())
                        gc=1
                    end
                    local phys5 = camera:GetPhysicsObject()
                    phys5:EnableMotion(false)
                    --sprites[2][i] = sprites[1][i]:GetNWEntity("PlayerCamera")
                    --sprites[2][i]:SetNWString("CharacterName", CurrentPlayers[1][i])
                    sprites[1][i]:SetNWEntity("PlayerCamera", camera)
                
                else
                    local dead = ents.Create("gmod_button")
                    sprites[1][i] = dead
                    dead:SetModel("models/models/deadplate/portraitv3.mdl")
                                    local tbl = GetNameAndHeight(CurrentPlayers[1][i])
                                    local pos = tbl[2]
                    dead:SetPos(Vector(newSpriteposrot[i][1].x,newSpriteposrot[i][1].y,newSpriteposrot[i][1].z-62.5+pos*3))
                    dead:SetAngles(Angle(newSpriteposrot[i][2].x,newSpriteposrot[i][2].y+180,newSpriteposrot[i][2].z))
                    dead:SetSubMaterial(4, "plates/"..CurrentPlayers[1][i])
                    if(CurrentPlayers[1][i] == "K1-B0") then
                        dead:SetSubMaterial(4, "plates/k1b0")
                    end
                    if(CurrentPlayers[1][i] == "Ayumu") then
                        dead:SetSubMaterial(4, "plates/ayumu1")
                    end
                    if(CurrentPlayers[1][i] == "Sora") then
                        dead:SetSubMaterial(4, "plates/sora1")
                    end
                    dead:Spawn()
                    dead:SetCollisionGroup(20)
                    local phys6 = dead:GetPhysicsObject()
                    phys6:EnableMotion(false)
                end
            end
        end


    end
end)

hook.Add("PlayerSpawn", "Join123", function (ply)
        if startpreload then
            net.Start("StartPreload")
        net.WriteTable(CurrentPlayers[1])
        net.Send(ply)
            end
        end)
--hook.Add( "PlayerConnect", "JoinGlobalMessage", function( name, ip )
    --PrintMessage( HUD_PRINTTALK, name .. " has joined the game." )
--end )

net.Receive("StartFirstRebuttal", function()
    local name = net.ReadString()
    for i=1,16 do
    if (sprites[2][i]!=nil) then
        if sprites[2][i]:GetNWString("CharacterName") == name then
            net.Start("GetFirstCamera")
            net.WriteEntity(sprites[2][i])
            net.Broadcast()
        end 
    end
    end
    end)

net.Receive("StartSecondRebuttal", function()
    local name = net.ReadString()
    for i=1,16 do
    if (sprites[2][i]!=nil) then
        if sprites[2][i]:GetNWString("CharacterName") == name then
            net.Start("GetSecondCamera")
            net.WriteEntity(sprites[2][i])
            net.Broadcast()
        end 
    end
    end
    end)

hook.Add("EntityEmitSound", "hidesoundman2", function (tabletop)
    if tabletop.Entity:GetNWString("EngrammaOf") ~= "" then
        tabletop.Volume = 0
        return true
    end
end)

print('SetTrial has been loaded')

for i,v in ipairs(ents.GetAll()) do
    if v:GetClass() == "room_table" then
        print(v:GetPos())
        print(v:GetAngles())
    end
end
