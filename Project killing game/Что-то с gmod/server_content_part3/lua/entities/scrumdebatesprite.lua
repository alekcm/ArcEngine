if (SERVER)then
	AddCSLuaFile("scrumdebatesprite.lua")
end

ENT.Type = "anim"
ENT.Base = "base_gmodentity"
ENT.Category = "2D Classes"
ENT.PrintName = "Scrum Debate Sprite"
ENT.Spawnable = true
ENT.Editable = true
	
function ENT:SetupDataTables()

	self:NetworkVar( "String",	0, "CharacterName",	{ KeyName = "CharacterName",	Edit = { type = "String", order = 0} } )
	self:NetworkVar( "Int",	1, "SpriteCount",	{ KeyName = "SpriteCount",	Edit = { type = "Int",	min = 0, max = 100 ,	order = 1} } )
    self:NetworkVar( "String",	2, "Side",	{ KeyName = "Side",	Edit = { type = "String", order = 2} } )
	
end
--local camera
local SendedNameForCamera
function ENT:Initialize( )
		self:SetSpriteCount(0)
		self:SetModel("models/hunter/blocks/cube05x05x05.mdl")
		self:SetMaterial("aaa/empty")
		self:PhysicsInit(SOLID_VPHYSICS)
		self:SetMoveType(MOVETYPE_VPHYSICS)
		self:SetSolid(SOLID_VPHYSICS)
		self:SetCollisionGroup(20)
		--self:SetCharacterName("Rantaro")
		--self:SetSide("Left")

		local ang = self:GetAngles()
	self:SetAngles(Angle (0,0,0))

local PlayerCameraPlaceLeft = ents.Create("char_camera")

PlayerCameraPlaceLeft:SetPos(self:GetPos()+Vector(20, 10, 15))
PlayerCameraPlaceLeft:SetAngles(Angle(0, 180, 0))
PlayerCameraPlaceLeft:SetParent(self)

local PlayerCameraPlaceRight = ents.Create("char_camera")

PlayerCameraPlaceRight:SetPos(self:GetPos()+Vector(-20, 10, 15))
PlayerCameraPlaceRight:SetAngles(Angle(0, 0, 0))
PlayerCameraPlaceRight:SetParent(self)

local PlayerCameraPlaceLeftLong = ents.Create("char_camera")

PlayerCameraPlaceLeftLong:SetPos(self:GetPos()+Vector(23, 17, 15))
PlayerCameraPlaceLeftLong:SetAngles(Angle(0, 180, 0))
PlayerCameraPlaceLeftLong:SetParent(self)

local PlayerCameraPlaceRightLong = ents.Create("char_camera")

PlayerCameraPlaceRightLong:SetPos(self:GetPos()+Vector(-23, 17, 15))
PlayerCameraPlaceRightLong:SetAngles(Angle(0, 0, 0))
PlayerCameraPlaceRightLong:SetParent(self)

self:SetNWEntity("PlayerCameraPlaceLeft" , PlayerCameraPlaceLeft)
self:SetNWEntity("PlayerCameraPlaceRight" , PlayerCameraPlaceRight)
self:SetNWEntity("PlayerCameraPlaceLeftLong" , PlayerCameraPlaceLeftLong)
self:SetNWEntity("PlayerCameraPlaceRightLong" , PlayerCameraPlaceRightLong)


self:SetAngles(ang)
		
	--[[	self.camera = ents.Create("prop_physics")
		if (!IsValid(self.camera)) then return end
		self.camera:SetModel("models/dav0r/camera.mdl")
		self.camera:SetPos(self:GetPos() + Vector(-50,0,50))
		self.camera:SetParent(self)
		self.camera:SetNoDraw(true)
		self.camera:Spawn()
		self.camera:PhysWake()]]

	


end
local _h = 900
local _w = 600
local SendedName = ""
local SendedNumber = 0

net.Receive('ChangeScrumSprite2', function()
	SendedName = net.ReadString()
	SendedNumber = net.ReadFloat()
end)

local CameraPlace
local IsShow = true

if SERVER then
function ENT:Use()
        
end
end
--[[net.Receive ('MoveCamera', function()
	SendedNameForCamera = net.ReadString()
end)]]

local _cam = nil
local _camplace
local _camleft
local _camright
local _camleftlong
local _camrightlong
local _globalcamera


function Animate(camera, from, to, count, angle)
		camera:SetPos(LerpVector(count, to, from))
		camera:SetAngles(angle)
		timer.Simple(0.01, function ()
			if count >0.01 then
			Animate(camera, from, to, count-count/100, angle)
		end
			end)

end

local singleanimation = true
function ENT:Think()

	if  SendedName ==  self:GetCharacterName() then
	self:SetSpriteCount(1)
	else
	self:SetSpriteCount(0)
end
--[[if SendedNameForCamera == self:GetCharacterName() then
if SERVER then
	print (SendedNameForCamera)
	net.Start('GoCameraTo')	
	net.WriteEntity(self.camera)
	net.Broadcast()
	SendedNameForCamera = ""
end
end]]
--self:SetNWString("CharacterName", "hiyoko")
if self:GetSide() == "" then
self:SetSide(self:GetNWString("Side"))
end
if self:GetCharacterName() == "" then
self:SetCharacterName(self:GetNWString("CharacterName"))
local PlayerName = ""
local Name = self:GetCharacterName()
local updown = 0

if Name == "Makoto" then 
	updown = -1
		elseif Name == "Akane" then 
		elseif Name == "Angie" then 
		updown = -3
		elseif Name == "Aoi"  then 
		updown = -3
		elseif Name == "Chiaki" then 
		updown = -3
		elseif Name == "Celestia" then 
		updown = -0.5
		elseif Name == "Byakuya" then 
		updown = 0
        elseif Name == "Imposter" then 
		elseif Name == "Chihiro" then 
		updown = -6
		elseif Name == "Fuyuhiko" then 
		updown = -3.5
		elseif Name == "Gonta" then 
		elseif Name == "Gundham" then 
		elseif Name == "Hajime" then 
		elseif Name == "Hifumi" then 
		updown = -3
		elseif Name == "Himiko" then 
		updown = -5
		elseif Name == "Hiyoko" then 
		updown = -4
		elseif Name == "Ibuki" then 
		updown = -2
		elseif Name == "Junko" then 
		elseif Name == "K1-B0" then 
		updown = -4
		elseif Name == "Kaede" then 
		updown = -2
		elseif Name == "Kaito" then 
		updown = -1.5
		elseif Name == "Kazuichi" then 
		updown = -1
		elseif Name == "Kirumi" then 
		updown = -1.5
		elseif Name == "Kiyotaka" then 
		updown = -1
		elseif Name == "Kokichi" then 
		updown = -4
		elseif Name == "Korekiyo" then 
		elseif Name == "Kyoko" then 
		updown = -2
		elseif Name == "Leon" then 
		updown = -2
		elseif Name == "Mahiru"then 
		updown = -2
		elseif Name == "Maki" then 
		updown = -3
		elseif Name == "Mikan" then 
		updown = -1
		elseif Name == "Miu" then 
		updown = -2
		elseif Name == "Mondo" then 
		elseif Name =="Monokuma" then 
		updown = -20
		elseif Name == "Nagito" then 
		elseif Name == "Nekomaru" then 
		elseif Name == "Peko" then 
		updown = -1
		elseif Name == "Rantaro" then 
		updown = -1
		elseif Name == "Ryoma" then 
		updown = -20
		elseif Name == "Sakura" then 
		updown = 2
		elseif Name == "Sayaka" then 
			updown = -1
		elseif Name == "Shuichi" then 
		updown = -1
		elseif Name == "Sonia" then 
		updown = -1
		elseif Name == "Tenko" then 
		updown = -2
		elseif Name == "Teruteru" then 
		updown = -6
		elseif Name == "Toko" then 
		updown = -2
		elseif Name == "Tsumugi" then 
		updown = -1
		elseif Name == "Yasuhiro" then 
		updown = -1
		elseif Name == "Emma" then 
		updown = -1
		elseif Name == "Shobai" then 
		elseif Name == "Hibiki" then 
		updown = -4
		elseif Name == "Iroha" then 
		updown = -4
		elseif Name == "Kanade" then 
		updown = -4
		elseif Name == "Kokoro" then 
		updown = -3
		elseif Name == "Makunouchi" then 
		updown = -1
		elseif Name == "Mikado" then 
		elseif Name == "Nikei" then 
		updown = -1
		elseif Name == "Setsuka" then 
		updown = -2
		elseif Name == "Shinji" then 
		elseif Name == "Teruya" then 
		updown = 1
		elseif Name == "Yoruko" then 
		updown = -1.5
		elseif Name == "Yuki" then 
		updown = -2
		elseif Name == "Sora" then 
		updown = -2
		elseif Name == "Yuri" then 
		updown = -2
		elseif Name == "Ayumu" then 
		updown = -1
		elseif Name == "Akira" then 
		elseif Name == "Aruma" then 
		updown = -1
		elseif Name == "Kasumi" then 
		updown = -3
		elseif Name == "Kazuomi" then 
		updown = -2
		elseif Name == "Kego" then 
		updown = -20
		elseif Name == "Maiko" then 
		updown = -3
		elseif Name == "Mikoto" then
        updown = -3
        elseif Name == "Seishi" then 
		updown = 2
		elseif Name == "Misuzu" then 
		updown = -3
		elseif Name == "Mitsunari" then 
		updown = 3
		elseif Name == "Narumi" then 
		updown = -5
		elseif Name == "Saiji" then 
		updown = 1.5
		end


self:GetNWEntity("PlayerCameraPlaceLeft"):SetPos(self:GetNWEntity("PlayerCameraPlaceLeft"):GetPos()+Vector(0,0,updown*2))
self:GetNWEntity("PlayerCameraPlaceRight"):SetPos(self:GetNWEntity("PlayerCameraPlaceRight"):GetPos()+Vector(0,0,updown*2))
self:GetNWEntity("PlayerCameraPlaceLeftLong"):SetPos(self:GetNWEntity("PlayerCameraPlaceLeftLong"):GetPos()+Vector(0,0,updown*2))
self:GetNWEntity("PlayerCameraPlaceRightLong"):SetPos(self:GetNWEntity("PlayerCameraPlaceRightLong"):GetPos()+Vector(0,0,updown*2))


if self:GetSide() == "Left" then
		self:GetNWEntity("PlayerCamera"):SetPos(self:GetNWEntity("PlayerCameraPlaceLeft"):GetPos())
	else
		self:GetNWEntity("PlayerCamera"):SetPos(self:GetNWEntity("PlayerCameraPlaceRight"):GetPos())
	end

self:SetCollisionGroup(20)

end

if _cam == self:GetNWEntity("PlayerCamera") then
	if _camleft ~= self:GetNWEntity("PlayerCameraPlaceleft") then
	_camleft = self:GetNWEntity("PlayerCameraPlaceLeft")
	_camright = self:GetNWEntity("PlayerCameraPlaceRight")
	_camleftlong = self:GetNWEntity("PlayerCameraPlaceLeftLong")
	_camrightlong = self:GetNWEntity("PlayerCameraPlaceRightLong")
	end
	
end
end


if SERVER then
	util.AddNetworkString("StartScrumCameraAnimation")
	util.AddNetworkString("StartScrumCameraAnimation2")
	util.AddNetworkString("ChangeScrumSprite2")
	end
	
local single1 = true
net.Receive("StartScrumCameraAnimation", function ()
	if single1 == true then
		single1 = false
	local tbl = net.ReadTable()
	_cam = tbl[1]
	_globalcamera = tbl[2]
timer.Simple(0.2, function ()

local count = 1
	if self:GetSide() == "Left" then
		count = 1
	else
		count = 2
end
	tbl[1]:SetAngles(Angle(tbl[1]:GetAngles().X,tbl[1]:GetAngles().Y,0))
			if count == 1 then
			Animate(tbl[1], _camleft:GetPos(), _camleftlong:GetPos(), 1,_camleft:GetAngles() )
			elseif count == 2 then
			Animate(tbl[1], _camright:GetPos(), _camrightleft:GetPos(), 1, _camright:GetAngles())
	end
	


	end)
		timer.Simple(1, function ()
	single1 = true
	end)
	end
	--net.Start("StartCameraAnimation2")
	--net.Broadcast()
	end)

function ENT:Draw()
	
	--[[if (SERVER)then
	local SelfName = self:GetCharacterName()
	local SelfNumber = self:GetSpriteCount()
	AddCSLuaFile("Colored/"..SelfName.."/"..SelfName.."_"..SelfNumber)
	AddCSLuaFile("Black/"..SelfName.."/"..SelfName.."_"..SelfNumber)
end]]
	
--print (SendedNameForCamera)
--print (self:GetCharacterName())
self:DrawModel()
local ang = self:GetAngles()
ang:RotateAroundAxis(self:GetAngles():Right(), 90)
ang:RotateAroundAxis(self:GetAngles():Forward(), 90)
local SelfName = self:GetCharacterName()
local SelfNumber = self:GetSpriteCount()
local SelfSide = self:GetSide()
--[[cam.Start3D2D(self:GetPos()+Vector(-0.5,-0.5,0),ang, 0.1)
surface.SetMaterial(Material("Black/"..SelfName.."/"..SelfName.."_"..SelfNumber))
surface.SetDrawColor(255,0,0,100)
surface.DrawTexturedRect(-_w/2, -_h+10, _w, _h)
cam.End3D2D()]]
cam.Start3D2D(self:GetPos()+Vector(0,0,-40),ang, 0.1)
surface.SetDrawColor(255,255,255,255)
surface.SetMaterial(Material("/scrumdebatesprites/"..SelfName.."Right"..SelfNumber..".png"))
surface.DrawTexturedRect(0-_w/2, -_h+110, _w, _h)
cam.End3D2D()
ang:RotateAroundAxis(Vector(0,0,90), 180)
cam.Start3D2D(self:GetPos()+Vector(0,0,-40),ang, 0.1)
surface.SetDrawColor(255,255,255,255)
surface.SetMaterial(Material("/scrumdebatesprites/"..SelfName.."Left"..SelfNumber..".png"))
surface.DrawTexturedRect(0-_w/2, -_h+110, _w, _h)
cam.End3D2D()
end
