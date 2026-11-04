if (SERVER)then
	AddCSLuaFile("ddfpoison.lua")

	util.AddNetworkString("ActivePoison")
	util.AddNetworkString("SendMessageToEndTrial")
end

ENT.Type = "anim"
ENT.Base = "base_gmodentity"
ENT.Category = "DDF Food"
ENT.PrintName = "Poison"
ENT.Spawnable = true
ENT.Editable = true

function ENT:SetupDataTables()

self:NetworkVar( "Int",	0, "Parts",	{ KeyName = "Parts",	Edit = { type = "Int", order = 0, min = 1, max = 10, order = 0} } )
self:NetworkVar( "Int",	1, "TimeDeath",	{ KeyName = "TimeDeath",	Edit = { type = "Int", min = 0, max = 100, order = 1} } )
self:NetworkVar( "Int",	2, "TimeSleepy",	{ KeyName = "TimeSleepy",	Edit = { type = "Int", min = 0, max = 100, order = 2} } )
self:NetworkVar( "Int",	3, "StartDizziness",	{ KeyName = "StartDizziness",	Edit = { type = "Int", min = 0, max = 100, order = 4} } )
self:NetworkVar( "String",	0, "Model",	{ KeyName = "Model",	Edit = { type = "String", order = 3} } )

	if ( SERVER ) then
		self:NetworkVarNotify( "TimeDeath", self.OnTimeChanged )
		self:NetworkVarNotify( "Model", self.OnCharacterNameChanged )
	end
end


local food = 5
local thirsty = 0
local energy = 0
local alcohol = 0
local damage = 0
local storageTime = 10

local function Corruption(ent)
	timer.Simple(storageTime * 60, function ()
		if ent:IsValid() then
    	if ent:GetParts() > 1 then
			ent:SetParts(ent:GetParts() - 1)
		else
		ent:Remove()
    	end
    	Corruption(ent)
    	end
    	end)
end

function ENT:OnTimeChanged( name, old, new )
	self:SetNWString("TimeDeath",new)
end

if (SERVER)then
	function ENT:Initialize( )
		self:SetModel("models/foodnhouseholditems/pizzabox.mdl")
	    self:SetUseType(SIMPLE_USE)
	    self:SetMoveType(MOVETYPE_VPHYSICS)
	    self:PhysicsInit(SOLID_VPHYSICS)
	    self:SetSolid( SOLID_VPHYSICS )
	    self:PhysWake()
	    self:SetParts(2)
	    Corruption(self)
	end
end

function ENT:OnModelChanged( varname, oldvalue, newvalue )
	self:SetModel(self:GetNWString("Model"))
	self:SetMoveType(MOVETYPE_VPHYSICS)
	self:PhysicsInit(SOLID_VPHYSICS)
    self:SetSolid( SOLID_VPHYSICS )
	self:SetTrigger( true )
    self:PhysWake()
end

if SERVER then
	util.AddNetworkString('EatFood')
end

function ENT:Use(activator)
	if (activator:IsPlayer()) then
		net.Start("EatFood")
        local send = {food, thirsty, energy, alcohol}
        net.WriteTable(send)
		net.Send(activator)
        if(self:GetTimeDeath() > 0) then
			timer.Simple(self:GetTimeDeath(),function() activator:Kill() end)
		end
		if(self:GetTimeSleepy() > 0) then
			timer.Simple(self:GetTimeSleepy(),function() 		
			net.Start("EatFood")
	        local send = {0, 0, -100, 0}
	        net.WriteTable(send)
			net.Send(activator) end)
		end
		local Diz = self:GetStartDizziness()
		if(Diz > 0) then
			timer.Simple(2,function()	
				net.Start("ActivePoison")
				print(Diz)
				net.WriteFloat(Diz)
				net.Send(activator) 
			end)
		end
		if self:GetParts() > 1 then
			self:SetParts(self:GetParts() - 1)
		else
		self:Remove()
		end
	end
end

if CLIENT then
	net.Receive("ActivePoison", function()
    	hook.Add( "RenderScreenspaceEffects", "PoisonShader", function()
    		DrawMotionBlur( -50, 0.8, 0.01 )
    		DrawToyTown(20, ScrH())
		end )
		timer.Simple(net.ReadFloat(), function()
			hook.Remove("RenderScreenspaceEffects", "PoisonShader")
		end)
	end)
end

function ENT:Draw()
	self:DrawModel()
	if (LocalPlayer():GetPos():Distance(self:GetPos())<100) then
            AddWorldTip(self:EntIndex(), self:GetParts(), 0.5, self:LocalToWorld(Vector(0, 0, 64)), self)
	end
end