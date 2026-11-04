if (SERVER)then
	AddCSLuaFile()
end

ENT.Type = "anim"
ENT.Base = "base_gmodentity"
ENT.Category = "2D Classes"
ENT.PrintName = "Door"
ENT.Spawnable = true
ENT.Editable = true
	
function ENT:SetupDataTables()
    self:NetworkVar( "Vector",	1, "TelPos",	{ KeyName = "TelPos",	Edit = { type = "Vector",	order = 1} } )
    self:NetworkVar( "Angle",	2, "TelRot",	{ KeyName = "TelRot",	Edit = { type = "Angle",	order = 2} } )
    self:NetworkVar( "Bool",	3, "RandomTelPos",	{ KeyName = "RandomTelPos",	Edit = { type = "Bool",	order = 3} } )
    self:NetworkVar( "Float",	4, "GravityScale",	{ KeyName = "GravityScale",	Edit = { type = "Float",	order = 4} } )
    self:NetworkVar( "Float",	5, "SizeScale",	{ KeyName = "SizeScale",	Edit = { type = "Float",min = 0, max = 10 ,	order = 5} } )
end
--local camera
function ENT:Initialize( )
		self:SetModel("models/props/v3/schoolmodel/pool_storagedoor.mdl")
		--self:SetMaterial("aaa/empty")
		self:PhysicsInit(SOLID_VPHYSICS)
		self:SetMoveType(MOVETYPE_VPHYSICS)
		self:SetSolid(SOLID_VPHYSICS)
		self:SetCollisionGroup(20)
		self:SetGravityScale(1)
		self:SetSizeScale(1)
    self:SetModelScale(0.25,1)
    print(self:GetPos())
end
local RandomPositions = {Vector(10148.248047, 3222.777344, 2448.031250),Vector(9846.264648, 3084.185791, 2192.031250),Vector(7439.098633, 3260.523926, 2448.214844),Vector(7556.610840, 3593.254639, 2448.031250),Vector(7770.363770, 3500.601807, 2448.031250),Vector(6364.881348, 4739.682617, 2448.031250),Vector(6405.046387, 3759.343506, 2448.031738),Vector(9499.973633, 5290.105469, 2448.980469),Vector(10402.948242, 4584.522949, 2456.932617),Vector(7867.117188, 3237.647461, 2712.810059),Vector(-3291.420166, 4061.227539, 2520.031250),Vector(9341.518555, 4012.854248, 3488.031250),Vector(9234.537109, 3431.989746, 3232.031250),Vector(7124.430176, 2211.301270, 3232.031250),Vector(7113.411621, 3323.593506, 3232.160400),Vector(8811.410156, 2947.610596, 2976.031250),Vector(11630.843750, 4742.433594, 2904.781006),Vector(-172.251282, 3763.440674, 2694.031250),Vector(869.774048, -2184.952881, 2016.031250),Vector(-3770.154785, -4570.677734, 1900.306641),Vector(-5048.105469, -4539.637695, 1920.031250),Vector(-7273.076172, 1770.002441, 2360.031250),Vector(7003.276367, 6740.385254, 2976.031250)}
local single = true
function ENT:Use(ply)
    if single then
        single = false
        timer.Simple(0.1,function()
                single = true
            end)
	if self:GetRandomTelPos() then
		local l = math.random(1, table.Count(RandomPositions))
    ply:SetPos(RandomPositions[l])
else
	ply:SetPos(self:GetTelPos())
	ply:SetEyeAngles(self:GetTelRot())
	ply:SetGravity(self:GetGravityScale())
	ply:SetModelScale(self:GetSizeScale(),600)
	end
        end
end

function ENT:Draw()
self:DrawModel()
end
