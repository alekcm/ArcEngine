if (SERVER)then
	AddCSLuaFile("global_camera.lua")
	util.AddNetworkString("SendGlobalCameraMove")
end

ENT.Type = "anim"
ENT.Base = "base_gmodentity"
ENT.Category = "2D Classes"
ENT.PrintName = "Global Camera"
ENT.Spawnable = true
ENT.Editable = true
	local TrialIsOn = false
	local ind
function ENT:Initialize( )
	if CLIENT then
ind = self:EntIndex()
net.Start("SendCamera2")
net.WriteEntity(self)
net.SendToServer()
net.Start("SendGlobalCamera")
net.WriteEntity(self)
net.SendToServer()
end
		self:SetModel("models/dav0r/camera.mdl")

		self:PhysicsInit(SOLID_VPHYSICS)
		self:SetMoveType(MOVETYPE_VPHYSICS)
		self:SetSolid(SOLID_VPHYSICS)
		self.this = self


end	
local _cam = nil

net.Receive("SendGlobalCameraMove", function ()
		_cam = net.ReadEntity()
end)

function ENT:Think()
	if (_cam~=nil and self:IsValid() and _cam:IsValid()) then
        local posGlob = self:GetPos()
			self:SetPos(LerpVector(0.1, self:GetPos(), _cam:GetPos()))
        if(posGlob==self:GetPos()) then
            self:SetPos(LerpVector(0.1, self:GetPos(), _cam:GetPos()))
        end
		self:SetAngles(LerpAngle(0.1, self:GetAngles(), _cam:GetAngles()))
	end
end
function ENT:Draw()
	--self:DrawModel()
end

