if (SERVER)then
	AddCSLuaFile("char_camera.lua")
end

ENT.Type = "anim"
ENT.Base = "base_gmodentity"
ENT.Category = "2D Classes"
ENT.PrintName = "Char Camera"
ENT.Spawnable = true
ENT.Editable = true
	local TrialIsOn = false
	local ind
	function ENT:SetupDataTables()

	self:NetworkVar( "String",	0, "CharacterName",	{ KeyName = "CharacterName",	Edit = { type = "String", order = 1} } )
	end
function ENT:Initialize( )

		self:SetModel("models/dav0r/camera.mdl")

		self:PhysicsInit(SOLID_VPHYSICS)
		self:SetMoveType(MOVETYPE_VPHYSICS)
		self:SetSolid(SOLID_VPHYSICS)
		--self:IsNoDraw(true)
		self.this = self
		if CLIENT then
			net.Start("SendCharCamera")
			net.WriteEntity(self)
			net.SendToServer()
		end

end	

local _cam
local IsShow = true
net.Receive('HideCameras2', function()
	IsShow = net.ReadBool()
end)
net.Receive('OffCameras', function()
	IsShow = false
end)
local single1 = true

net.Receive("StartSecondRebuttal2", function ()
	local name = net.ReadString()
	if name == this:GetCharacterName() then
	net.Start("GetSecondCamera2")
	net.WriteEntity(self)
	net.SendToServer()
end
	end)

net.Receive("StartFirstRebuttal2", function ()
	local name = net.ReadString()
	if name == this:GetCharacterName() then
	net.Start("GetFirstCamera2")
	net.WriteEntity(self)
	net.SendToServer()
end
	end)

function ENT:Draw()
	if (IsShow == true) then
	self:DrawModel()
end
end

function ENT:Use()
	print(self:GetPos())
	print(self:GetAngles())
end