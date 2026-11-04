print('server has been loaded')
resource.AddWorkshop(2787765210)
resource.AddWorkshop(2787756510)
resource.AddWorkshop(2634017672)
resource.AddWorkshop(2407167384)
resource.AddWorkshop(2409425776)
resource.AddWorkshop(2493368529)
resource.AddWorkshop(2407163868)
resource.AddWorkshop(2472903109)
resource.AddWorkshop(2430155522)

resource.AddWorkshop(841066734)
resource.AddWorkshop(108024198)


util.AddNetworkString("SendMessageToStartTrial")
util.AddNetworkString("SendMessageToEndTrial")
util.AddNetworkString("SendMessageToSwapTables")
util.AddNetworkString("SendMessageToCleanEvidences")
util.AddNetworkString("StartTrial")
util.AddNetworkString("ChangeForm")
util.AddNetworkString('ChangeSprite1')
util.AddNetworkString('ChangeSprite2')
util.AddNetworkString('HideTables')
util.AddNetworkString('HideTables2')
util.AddNetworkString('SendSpriteToAll')
util.AddNetworkString('SendCamera')
util.AddNetworkString('MoveCamera')
util.AddNetworkString('MoveCamera1')
util.AddNetworkString('EndTrial')
util.AddNetworkString('EndTrial1')
util.AddNetworkString('SetCamera')
util.AddNetworkString('GoCameraTo')
util.AddNetworkString('SendCamera2')
util.AddNetworkString('SendCamera3')
util.AddNetworkString('HideCameras')
util.AddNetworkString('HideCameras2')
util.AddNetworkString('OffCameras')
util.AddNetworkString('Objection')
util.AddNetworkString('Objection2')
util.AddNetworkString('SendEvidence')
util.AddNetworkString('Consent')
util.AddNetworkString('Consent2')
util.AddNetworkString('BDA')
util.AddNetworkString('BDA2')
util.AddNetworkString('BDA3')
util.AddNetworkString('BDA4')
util.AddNetworkString('BDAnoise')
util.AddNetworkString("GetKillerName")
util.AddNetworkString("SetKillerName")
util.AddNetworkString("StartSingleTrial")
util.AddNetworkString("EndSingleTrial")
util.AddNetworkString("RestartTrial")
util.AddNetworkString("SendCharList")
util.AddNetworkString('MorningAnnounsment')
util.AddNetworkString('NightAnnounsment')
util.AddNetworkString('MorningAnnounsment1')
util.AddNetworkString('NightAnnounsment1')
util.AddNetworkString('DayNightTurnOff')
util.AddNetworkString('DayNightTurnOn')
util.AddNetworkString("SendMonokoins")
util.AddNetworkString("GetMonokoinsFromAnotherPlayer")
util.AddNetworkString("MinusHealth")
util.AddNetworkString("RestartFood")
util.AddNetworkString("CanBeHungryOrNot")
util.AddNetworkString("CanBeHungryOrNot2")
util.AddNetworkString("RestartFoodForAll")
util.AddNetworkString("StartTrialDDF")
util.AddNetworkString("EndTrialDDF")
util.AddNetworkString("StopCameras")
util.AddNetworkString("StartFreetime")
util.AddNetworkString("SendName")
util.AddNetworkString("SendName2")
util.AddNetworkString("AmIWantEat")
util.AddNetworkString("SearchFood")
util.AddNetworkString("SearchFood2")
util.AddNetworkString("SendSoundNumber")
util.AddNetworkString("SendSoundNumber2")
util.AddNetworkString("BDAProp")
util.AddNetworkString("EvidenceInitialize")
util.AddNetworkString("EditStats")
util.AddNetworkString("EditStats2")
util.AddNetworkString("EditHealth")
util.AddNetworkString("SetWeaponPlayer")
util.AddNetworkString("SetMonokumaWeapon")
util.AddNetworkString("LoadPlayerSave")
util.AddNetworkString("GetSavesServer")
util.AddNetworkString("SetSavesServer")
util.AddNetworkString("LoadSaveServer")
util.AddNetworkString("SaveGmsServer")
util.AddNetworkString("CountServer")
util.AddNetworkString("CountMonokuma")
util.AddNetworkString("ChangeCountOn")
util.AddNetworkString("GiveKey")
util.AddNetworkString("GiveMonopad")
util.AddNetworkString("TryOpenMonopad")
util.AddNetworkString("TryOpenMonopad2")
util.AddNetworkString("ChangeMenuMonocoins")
util.AddNetworkString("ChangePersonalMonocoins")
util.AddNetworkString("ChangeNameSprite")
util.AddNetworkString("ChangeNameSpriteClient")
util.AddNetworkString("ChangeNameSpriteServer")

util.AddNetworkString("SamAbility")

local yomu = ""
local sterak = ""
local dolg = ""

net.Receive("SamAbility", function()
    local inf = net.ReadTable()
    PrintTable(inf)
    if inf[2]=="sterak" then
        sterak = inf[1]
    elseif inf[2]=="yomu" then
        yomu = inf[1]
    elseif inf[2]=="dolg" then
        dolg = inf[1]
    end
end)

local fm1 = nil
local fm2 = nil
local fm3 = nil
local wm1 = nil
local wm2 = nil
local wm3 = nil
local st1 = nil
local st2 = nil
local giveKey = false
local giveMonopad = false
local IsTrial = false
local namePSC = ""
local nameSC = ""

net.Receive("TryOpenMonopad", function(len, ply)
        if IsTrial then
        net.Start("TryOpenMonopad2")
        net.Send(ply)
    end
        end)

hook.Add("PlayerDroppedWeapon", "PrintWhenDrop", function(owner, wep)

--[[    print(wep:GetModel())
        if wep:GetModel() == "models/ddf/flashlight_world.mdl" then
        owner:Give("flashlight")
        owner:SelectWeapon("flashlight")
        wep:Remove()
    end--]]
end)
hook.Add( "PlayerSwitchFlashlight", "BlockFlashLight", function( ply, enabled )
--[[    print(ply:GetActiveWeapon():GetClass())
    return false--]]
    return (ply:GetActiveWeapon():GetClass() == "flashlight") -- Allow the player to use their flashlight if they are an admin
end )

hook.Add( "PlayerSpray", "DisablePlayerSpray", function( ply )
	return true
end )

    net.Receive("BDAProp", function()
    	local ent = net.ReadEntity()
    	local num = net.ReadFloat()
    	ent:SetNWFloat("BDACount", num)
        end)


    util.AddNetworkString("StopCameras2")
    net.Receive("StopCameras", function()
            net.Start("StopCameras2")
            net.Broadcast()
        end)

net.Receive("SearchFood", function(len, ply)
        --ply:Freeze(true)
    end)

local countOn = false
net.Receive("CountServer", function(len, ply)
        countOn = net.ReadBool()
        net.Start("CountMonokuma")
        net.WriteBool(countOn)
        net.Broadcast()
    end)

net.Receive("ChangeCountOn", function(len, ply)
        net.Start("CountMonokuma")
        net.WriteBool(countOn)
        net.Broadcast()
    end)


net.Receive("SearchFood2", function(len, ply)
                --ply:Freeze(false)
    end)

local camera
local PlayersPositions
local CurrentChars = 0
local BDASeekers = {}
local PlayerSayRadius = 1000
local GMSayRadius = 1000
CanBeHungry = false

net.Receive("CanBeHungryOrNot", function ()
	CanBeHungry = !CanBeHungry
	local bedposrot = {
	{Vector(-6624.96, 1941.6011, 2312.5115), Angle(-0.0308, 90.3036, 0.052)},
	{Vector(-6640.9067, 1213.6987, 2312.4492), Angle(0.0193, 90.0185, 0.0208)},
	{Vector(-7003.0776, 2664.9368, 2580.4255),Angle(0.0149, 179.9738, 0.013)},
	{Vector(-7475.0317, 2664.7202, 2312.3982),Angle(0.0132, 179.9993, 0.0113)},
	{Vector(-7475.1543, 2664.6541, 2580.5103), Angle(0.0138, -179.9867, 0)},
	{Vector(-8190.6177, 2278.9033, 2580.4163),Angle(-0.0025, -90.0046, 0.0232)},
	{Vector(-6641.2637, 1213.1158, 2580.51),Angle(0.0138, 90.0014, -0.0005)},
	{Vector(-7003.1138, 2665.6648, 2312.4287),Angle(0.0208, 179.983, 0.0116)},
	{Vector(-8190.6001, 1542.8794, 2580.5103),Angle(0.0135, -90.0288, -0.0004)},
	{Vector(-8190.6108, 2278.9236, 2312.405),Angle(0.0206, -90.0057, -0.0117)},
	{Vector(-6625.3911, 1941.1385, 2580.4294),Angle(0.0212, 89.9962, 0.0155)},
	{Vector(-7804.9463, 851.3011, 2312.4749),Angle(0.0085, 0.011, -0.0502)},
	{Vector(-7804.8447, 851.353, 2580.5105),Angle(0.0134, 0.0029, -0.0005)},
	{Vector(-7317.1001, 851.2999, 2580.4487),Angle(0.0497, 0.018, 0.0309)},
	{Vector(-8190.7041, 1542.9041, 2312.386),Angle(0.0292, -89.997, 0.0229)},
	{Vector(-7332.9233, 851.3341, 2312.4048),Angle(0.0046, 0.0252, -0.017)}}
    if (game.GetMap()=="dgrv3_ultimateacademy") then
    	for i, v in ipairs( ents.GetAll() ) do
    		if(v:GetModel()=="models/haxxer/normandy/comfybed.mdl") then
    			v:Remove();
    		end
    	end
    	for i = 1, 16 do
    		local bed = ents.Create("Bed")
    		bed:SetPos(bedposrot[i][1])
    		bed:SetAngles(bedposrot[i][2])
    		bed:Spawn()
    		bed:SetCollisionGroup(0)
    		local physBed = bed:GetPhysicsObject()
    		physBed:EnableMotion(false)
    	end

        if (fm1!=nil) then
           if(fm1:IsValid()) then
           		fm1:Remove()
           end
        end
        if (fm2!=nil) then
           if(fm2:IsValid()) then
           		fm2:Remove()
           end
        end
        if (fm3!=nil) then
           if(fm3:IsValid()) then
           		fm3:Remove()
           end
        end
        if (wm1!=nil) then
           if(wm1:IsValid()) then
           		wm1:Remove()
           end
        end
        if (wm2!=nil) then
           if(wm2:IsValid()) then
           		wm2:Remove()
           end
        end
        if (wm3!=nil) then
           if(wm3:IsValid()) then
           		wm3:Remove()
           end
        end
        if (st1!=nil) then
           if(st1:IsValid()) then
           		st1:Remove()
           end
        end
        if (st2!=nil) then
           if(st2:IsValid()) then
           		st2:Remove()
           end
        end
        fm1 = ents.Create("foodcreater")
        fm1:SetPos(Vector(5850.8315, 3911.532, 2467.9277))
        fm1:SetAngles(Angle(-0.0163, 0.0927, 0.1408))
        fm1:Spawn()
        fm1:SetCollisionGroup(0)
        local phys4 = fm1:GetPhysicsObject()
        phys4:EnableMotion(false)
        fm1:SetMaterial("aaa/empty")
        fm2 = ents.Create("foodcreater")
        fm2:SetPos(Vector(5850.8062, 3862.9329, 2468.88267))
        fm2:SetAngles(Angle(0.0183, 0.0198, -0.2687))
        fm2:Spawn()
        phys4 = fm2:GetPhysicsObject()
        phys4:EnableMotion(false)
        fm2:SetCollisionGroup(0)
        fm2:SetMaterial("aaa/empty")
        fm3 = ents.Create("foodcreater")
        fm3:SetPos(Vector(5850.7939, 3960.3328, 2467.146))
        fm3:SetAngles(Angle(0.1054, 0.2492, -0.0698))
        fm3:Spawn()
        phys4 = fm3:GetPhysicsObject()
        phys4:EnableMotion(false)
        fm3:SetCollisionGroup(0)
        fm3:SetMaterial("aaa/empty")
        wm1 = ents.Create("watercreator")
        wm1:SetPos(Vector(6188.7422, 3610.4746, 2490.4414))
        wm1:SetAngles(Angle(0.6566, 89.3683, 0.5721))
        wm1:Spawn()
        phys4 = wm1:GetPhysicsObject()
        phys4:EnableMotion(false)
        wm1:SetCollisionGroup(0)
        wm2 = ents.Create("watercreator")
        wm2:SetPos(Vector(6135.5542, 3611.4551, 2490.3333))
        wm2:SetAngles(Angle(0.2724, 90.1572, -0.0646))
        wm2:Spawn()
        phys4 = wm2:GetPhysicsObject()
        phys4:EnableMotion(false)
        wm2:SetCollisionGroup(0)
        wm3 = ents.Create("watercreator")
        wm3:SetPos(Vector(6066.3198, 3610.408, 2490.3987))
        wm3:SetAngles(Angle(0.2841, 90.9745, -0.0662))
        wm3:Spawn()
        phys4 = wm3:GetPhysicsObject()
        phys4:EnableMotion(false)
        wm3:SetCollisionGroup(0)
        st1 = ents.Create("stove")
        st1:SetPos(Vector(5837.2642, 3791.0342, 2455.5798))
        st1:SetAngles(Angle(-0.2581, 0, -0.001))
        st1:Spawn()
        phys4 = st1:GetPhysicsObject()
        phys4:EnableMotion(false)
        st1:SetCollisionGroup(0)
        st1:SetMaterial("aaa/empty")
        st2 = ents.Create("stove")
        st2:SetPos(Vector(5837.5205, 3730.0027, 2455.8643))
        st2:SetAngles(Angle(-0, -0, 0))
        st2:Spawn()
        phys4 = st2:GetPhysicsObject()
        phys4:EnableMotion(false)
        st2:SetCollisionGroup(0)
        st2:SetMaterial("aaa/empty")
    end
	net.Start("CanBeHungryOrNot2")
	net.WriteBool(CanBeHungry)
	net.Broadcast()
end)

net.Receive("GiveKey", function()
    giveKey = true
    for i,ply in pairs(player.GetAll()) do
        ply:Give("key",false)
    end
end)
net.Receive("GiveMonopad", function()
    giveMonopad = true
    for i,ply in pairs(player.GetAll()) do
        ply:Give("monopad",false)
    end
end)

hook.Add("PlayerSpawn", "Join", function (ply)
        if (ply:GetUserGroup() ==  "user") then
        ply:SetUserGroup( "player" )
            end
		ply:StripWeapons()
        if giveKey then
        ply:Give("key",false)
    end
            if giveMonopad then
        ply:Give("monopad",false)
    end
        net.Start("AmIWantEat")
        net.WriteBool(CanBeHungry)
        net.Send(ply)
        ply:SetCanZoom(false)
			net.Start("RestartFood")
			net.Send(ply)
			net.Start("CanBeHungryOrNot2")
	net.WriteBool(CanBeHungry)
	net.Send(ply)
	net.Start("EvidenceInitialize")
	net.Send(ply)
        net.Start("CountMonokuma")
        net.WriteBool(countOn)
        net.Send(ply)
           net.Start("GetSavesServer")
	       net.WriteTable(file.Find( "saves/*.gms", "MOD", "datedesc" ))
           net.Send(ply)
        net.Start("ChangeNameSpriteClient")
        net.WriteTable({namePSC,nameSC})
        net.Send(ply)
	end)

local function RestartFoodForAll()
	net.Start("RestartFood")
	net.Broadcast()
	for i,ply in pairs(player.GetAll()) do
		ply:SetHealth(100)
		--timer.Simple(0.1, function ()
			ply:SetNWFloat("PlayerFood", 0.1)
			--print(ply:GetNWFloat("PlayerFood"))
		local speed = ply:Health() / 100 * ply:GetNWFloat("PlayerSpeed") * (ply:GetNWFloat("PlayerFood") + 1)
  		ply:SetWalkSpeed(speed/2)
  		ply:SetSlowWalkSpeed(speed/4)
  		ply:SetJumpPower((speed-100)*2)
  		ply:SetRunSpeed(speed)
  		--end)
	end
end

net.Receive("RestartFoodForAll", function ()
	RestartFoodForAll()
	end)

net.Receive("MinusHealth", function (len,ply)
	local count = net.ReadFloat() 
	ply:SetHealth(ply:Health() - count)
	if ply:Health() <=0 and ply:Alive() then
		ply:Kill()
	end
	if ply:Health() > 100 then
		ply:SetHealth(100)
	end
	end)

net.Receive("BDA4", function (len, ply)
	net.Start("BDA3")
	net.Broadcast()
end)


net.Receive("RestartTrial", function ()
	local nm = net.ReadString()
	for i,ply in pairs(player.GetAll()) do
		if nm == ply:SteamID() then
			net.Start("RestartTrial")
			net.Send(ply)
		end
	end
end)



net.Receive("StartSingleTrial", function ()
	local nm = net.ReadString()
	for i,ply in pairs(player.GetAll()) do
		if nm == ply:SteamID() then

            for i,v in ipairs (ents.FindByClass( "sprite" )) do
                if v:GetPlayerName() == ply:Name() then
                    ply:SetPos(v:GetPos())
                end
            end

	net.Start("StartTrial")
                net.WriteTable(CurrentPlayers)
	net.Send(ply)
                net.Start("StartTrialDDF")
                net.Send(ply)
    ply:SetNWFloat("VoiceDistance", 600)            
	ply:Freeze(true)
ply:SetAvoidPlayers(true)
ply:SetCanZoom(false)
ply:StopZooming()
	InvisiableTrial(ply)
	ply:SetViewEntity(camera)
ply:DrawViewModel(false)
ply:DrawWorldModel(false)
	net.Start("CanBeHungryOrNot2")
	net.WriteBool(false)
	net.Send(ply)
end
end
        net.Start("OffCameras")
net.Broadcast()
net.Start("ChangeForm")
net.Broadcast()
	end)
net.Receive("EndSingleTrial", function()
local nm = net.ReadString()
	for i,ply in pairs(player.GetAll()) do
		if nm == ply:SteamID() then
			VisiableTrial(ply)
                ply:SetCanZoom(true)
ply:Freeze(false)
ply:DrawViewModel(true)
ply:DrawWorldModel(true)
ply:SetAvoidPlayers(false)
ply:SetCanZoom(true)
ply:SetViewEntity(ply1)
net.Start("EndTrialDDF")
                net.Send(ply)
	net.Start("EndTrial1")
	net.Send(ply)
		net.Start("CanBeHungryOrNot2")
	net.WriteBool(true)
	net.Send(ply)
			end
end
end)
net.Receive("SendMonokoins", function (len, plyname)
local name = net.ReadString()
local count = net.ReadFloat()
plyname:SetNWInt("Monocoins",plyname:GetNWInt("Monocoins")-count)
    for i,ply in pairs(player.GetAll()) do
        if ply:Name() == name then
		  net.Start("GetMonokoinsFromAnotherPlayer")
		  net.WriteString(plyname:Name())
		  net.WriteFloat(count)
		  net.Send(ply)
          ply:SetNWInt("Monocoins",plyname:GetNWInt("Monocoins")+count)
        end
    end
end)

net.Receive("BDA", function (len, ply)
	local new = true
	for v,info in pairs(BDASeekers) do
		if info == ply then 
			new = false
		end
		end
		if new == true then
	table.ForceInsert(BDASeekers, ply)
	local ent = net.ReadEntity()
	net.Start("BDAnoise")
	net.Send(ply)
	net.Start("BDA2")
	net.WriteString(ply:GetName())
	net.Broadcast()
end
end)

local DayNight = true
 local daylenght = 3600
 local prevmin = 70
hook.Add("Think", "snk", function()
local time = math.floor(CurTime()) + 1200 
while time > daylenght do
	time = time - daylenght
end
local hour = math.floor(time / 150)
local minute = math.floor((time - hour * 150)/150*60)
if (prevmin ~= minute) then
	prevmin = minute   
if (hour >= 22 or hour <8) then

                if Time == "Day" then
                	Time = "Night"
                    IsDay = false
               
SendTimeDDF()
	if DayNight == true then  
net.Start("NightAnnounsment")
net.Broadcast()
net.Start("NightAnnounsment1")
net.Broadcast() 
 end           
end
else
if Time == "Night" then
Time = "Day"
IsDay = true
SendTimeDDF()
if DayNight == true then
net.Start("MorningAnnounsment")
net.Broadcast()
net.Start("MorningAnnounsment1")
net.Broadcast()
 end 
end
end
end
end)
--[[
hook.Add( "PlayerCanHearPlayersVoice", "Maximum Range", function( listener, talker )
	if (talker:IsSuperAdmin()) then
    if tonumber( listener:GetPos():Distance( talker:GetPos() ) ) > tonumber( GMSayRadius ) then
        return false
end
end
if (!talker:IsSuperAdmin()) then
	if tonumber( listener:GetPos():Distance( talker:GetPos() ) ) > tonumber( PlayerSayRadius ) then
        return false
    end
end
end )]]

net.Receive ('DayNightTurnOff', function()
	DayNight = false
	end)

net.Receive ('DayNightTurnOn', function()
	DayNight = true
	end)

net.Receive ('Consent', function()
	local path = net.ReadString()
for i,ply in pairs(player.GetAll()) do
	net.Start("Consent2")
	net.WriteString(path)
	net.Broadcast()
end
end)


net.Receive ('SendCamera', function()
	local camera = net.ReadVector()
for i,ply in pairs(player.GetAll()) do
	ply:SetViewOffset(camera)
            end
end)
local single1 = true

net.Receive ('SendCamera2', function()
camera = net.ReadEntity()
end)

util.AddNetworkString("CleanEvidences")
net.Receive("SendMessageToCleanEvidences", function()
	net.Start("CleanEvidences")
	net.Broadcast()
	BDASeekers = {}
	end)

local ShowSpritesCameras = true

net.Receive("SendMessageToSwapTables", function(len, ply)
net.Start("HideTables2")
ShowSpritesCameras = !ShowSpritesCameras
net.WriteBool(ShowSpritesCameras)
net.Broadcast()
net.Start("HideCameras2")
net.WriteBool(ShowSpritesCameras)
net.Broadcast()
	end)

net.Receive("SendMessageToEndTrial", function(len, ply)
IsTrial = false
	for i,ply1 in pairs(player.GetAll()) do
timer.Simple(1, function ()
	ply1:Freeze(false)
ply1:SetAvoidPlayers(false)
	ply1:SetCanZoom(true)
	ply1:DrawViewModel(true)
ply1:DrawWorldModel(true)
VisiableTrial(ply1)
ply1:SetViewEntity(ply1)

end)
end
	--net.Start("CanBeHungryOrNot2")
	--net.WriteBool(CanBeHungry)
	--net.Broadcast()
	net.Start("EndTrial1")
	net.Broadcast()
	net.Start("EndDraw")
	net.Broadcast()
	--StartVotingDDF()
	Time = "Execution"
	Chapter = tostring(tonumber(Chapter) + 1)
        net.Start("EndTrialDDF")
                net.Broadcast()
net.Start("HideTables2")
net.Broadcast()

	end)

net.Receive("SendMessageToStartTrial", function(len, ply)
if ply:IsAdmin() or ply:IsSuperAdmin() then
    IsTrial = true
net.Start("StartTrial")
            net.WriteTable(CurrentPlayers)
net.Broadcast()
for i,ply1 in pairs(player.GetAll()) do
		timer.Simple(1, function ()
ply1:Freeze(true)
                        ply1:SetCanZoom(false)
ply1:SetNWFloat("VoiceDistance", 600)                          
ply1:SetAvoidPlayers(true)
ply1:SetCanZoom(false)
                       ply1:StopZooming()
	InvisiableTrial(ply1)

	ply1:SetViewEntity(camera)

ply1:DrawViewModel(false)
ply1:DrawWorldModel(false)
	end)
end
	net.Start("CanBeHungryOrNot2")
	net.WriteBool(false)
	net.Broadcast()
            net.Start("StartTrialDDF")
                net.Broadcast()
net.Start("ChangeForm")
net.Broadcast()
net.Start("SetCamera")
net.Broadcast()
net.Start("OffCameras")
net.Broadcast()
end
	end)

net.Receive ('ChangeSprite1',function (len, ply )
	local cnt = net.ReadFloat()
	local nm = net.ReadString()
	net.Start("ChangeSprite2")
	net.WriteString(nm)
	net.WriteFloat(cnt)
	net.Broadcast()
end)

util.AddNetworkString("GetCharName")
util.AddNetworkString("SetCharName")

net.Receive("SetCharName", function (len, ply)
	net.Start("GetCharName")
	net.WriteString(ply:Name())
	net.Broadcast()
	end)

function InvisiableTrial(ply)
	ply:NetworkVar( "Int", 0, "TrialNoclip" )
	if ply:GetMoveType() == MOVETYPE_WALK then
		ply:SetTrialNoclip(1)
		ply:SetMoveType( MOVETYPE_NOCLIP )
	end
end	

function VisiableTrial(ply)
		if ply:GetTrialNoclip() == 1 then
			ply:SetTrialNoclip(0)
			ply:SetMoveType( MOVETYPE_WALK )
		end
end	

hook.Add( "GetFallDamage", "RealisticDamage", function( ply, speed )
    if ply:GetNWBool("FallDamage") then
    return ( speed / 8 )
else
    return false
end
end )

net.Receive("EditStats", function()
	local stat = net.ReadString()
	local number = net.ReadFloat()
	local tablePlayers = net.ReadTable()
	for i,ply in ipairs(tablePlayers) do
		net.Start("EditStats2")
		net.WriteString(stat)
		net.WriteFloat(number)
		net.Send(ply)
	end
end)

net.Receive("EditHealth", function()
	local healthPly = net.ReadFloat()
	local tablePlayers = net.ReadTable()
	for i,ply in ipairs(tablePlayers) do
		ply:SetHealth(healthPly)
		local speed = ply:Health() / 100 * ply:GetNWFloat("PlayerSpeed") * (ply:GetNWFloat("PlayerFood") + 1)
	  	ply:SetWalkSpeed(speed/2)
	  	ply:SetSlowWalkSpeed(speed/4)
	  	ply:SetJumpPower((speed-100)*2)
	  	ply:SetRunSpeed(speed)
  	end
end)

net.Receive("SetWeaponPlayer", function(len,ply)
	local tablePlayersWeapon = net.ReadTable()
	local getWeapon = net.ReadString()
    local Say = {}
    table.Add(Say, {Color(255,255,255), getWeapon .. " выдан игрокам: "} )
    for d,t in ipairs(tablePlayersWeapon) do
        table.Add(Say, {Color(255,255,255), t:Name().. " "} )
    end
    net.Start("SendLocalMessage")
    net.WriteTable(Say)
    net.Send(ply)
	for i,v in ipairs(tablePlayersWeapon) do 
		v:Give(getWeapon,false)
		v:Give("re_hands",false)
	end
end)

net.Receive("SetMonokumaWeapon", function(len,ply)
	ply:Give("weapon_physgun")
	ply:Give("gmod_tool")
end)

net.Receive("GetSavesServer", function(len,ply)
	
end)

net.Receive("LoadSaveServer", function(len,ply)
	RunConsoleCommand( "gm_load", "saves/" .. net.ReadString()..".gms" )
end)

net.Receive("SaveGmsServer", function(len,ply)
	RunConsoleCommand( "gm_save")
	local f = file.Find( "saves/*.jpg", "MOD", "datedesc")
	net.Start("SetSavesServer")
	net.WriteTable(f)
	net.Send(ply)
end)

local pickSprite
for i,v in ipairs (ents:GetAll()) do
    if(v:GetModel()=="*220") then
        --print(v:GetSize())
        pickSprite = v
    end
end

net.Receive("ChangeMenuMonocoins", function(len,ply)
    local sign = net.ReadString()
    local numberMonocoins = net.ReadInt(18)
    local tablePlayers = net.ReadTable()
    for i,ply in ipairs(tablePlayers) do
        if sign == "+" then
            ply:SetNWInt("Monocoins", ply:GetNWInt("Monocoins")+numberMonocoins)
        elseif sign == "-" then
            ply:SetNWInt("Monocoins", ply:GetNWInt("Monocoins")-numberMonocoins)
        elseif sign == "=" then
            ply:SetNWInt("Monocoins", numberMonocoins)
        end
            
        net.Start("ChangePersonalMonocoins")
        net.WriteString(sign)
        net.WriteInt(numberMonocoins,18)
        net.Send(ply)
    end
end)

net.Receive("ChangeNameSprite", function(len,ply)
    local tabSpr = net.ReadTable()
    PrintTable(tabSpr)
    namePSC = tabSpr[1]
    nameSC = tabSpr[2]
    net.Start("ChangeNameSpriteClient")
    net.WriteTable({namePSC,nameSC})
    net.Send(ply)
end)

hook.Add("PlayerHurt", "DolgAndSterak", function(victim, attacker, healthRemaining)
    if ( attacker:IsPlayer() ) then
        if attacker:Name() == dolg and healthRemaining <41 then
            victim:Kill()
            victim:ChatPrint("Должок забран")
        end
    end
    if healthRemaining<71 and victim:GetNWString("Shield") ~= "1" and victim:Name()==sterak then
        whoHealth = victim:Health()
        victim:SetHealth(victim:Health()+130)
        victim:SetNWString("Shield", "1")
        timer.Simple(15, function()
            if whoHealth<victim:Health() then
                victim:SetHealth(whoHealth)
            end
        end)
        timer.Simple(360, function()
            victim:SetNWString("Shield", "0")
        end)
    end
end)

hook.Add("PlayerButtonDown", "Yomu15", function(ply,button)
    if button == 12 and IsFirstTimePredicted() and ply:GetNWString("Yomu") ~= 1 and ply:Name()== yomu then

    end
end)

