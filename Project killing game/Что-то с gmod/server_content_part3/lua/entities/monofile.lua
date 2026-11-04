if (SERVER)then
	AddCSLuaFile()
end

ENT.Type = "anim"
ENT.Base = "base_gmodentity"
ENT.Category = "2D Classes"
ENT.PrintName = "Monofile"
ENT.Spawnable = true
ENT.Editable = true
	
function ENT:SetupDataTables()
    self:NetworkVar( "String",	1, "Victim",	{ KeyName = "Data",	Edit = { type = "String",	order = 1} } )
    self:NetworkVar( "String",	2, "Text",	{ KeyName = "Text",	Edit = { type = "String",	order = 2} } )

end

function ENT:Initialize( )
		self:SetModel("models/alyxintprops/tabletop_notebook_0.mdl")
		self:PhysicsInit(SOLID_VPHYSICS)
		self:SetMoveType(MOVETYPE_VPHYSICS)
		self:SetSolid(SOLID_VPHYSICS)
--		self:SetCollisionGroup(20)
self:SetVictim("Empty")
self:SetNWFloat("WoundCound" , 0)
end



if SERVER then
	util.AddNetworkString("SendMonofile")
	util.AddNetworkString("SendMonofile2")

function ENT:Use(ply)
		self:SetNWString("VictimName" , self:GetVictim())
	net.Start("SendMonofile")
	net.WriteEntity(self)
	net.WriteString(self:GetText())
	net.Send(ply)
end



net.Receive ("SendMonofile2", function()
	local ents = net.ReadEntity()
	local name = net.ReadString()
	local count = net.ReadFloat()
	local data = net.ReadTable()
	ents:SetText(name)
		--ents:SetNWString("Text" , name)
		ents:SetNWFloat("WoundCount" , count)
		--ents:SetData(data)
		for i=1,count do
		ents:SetNWFloat("WoundPosX"..i,data[1][i])
		ents:SetNWFloat("WoundPosY"..i,data[2][i])
		ents:SetNWFloat("WoundRot"..i,data[3][i])
		ents:SetNWFloat("WoundSizeX"..i,data[4][i])
		ents:SetNWFloat("WoundSizeY"..i,data[5][i])
	end
end)
end

function ENT:Draw()
self:DrawModel()
end
