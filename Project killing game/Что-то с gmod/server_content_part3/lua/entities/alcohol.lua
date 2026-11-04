if (SERVER)then
	AddCSLuaFile("alcohol.lua")
end

ENT.Type = "anim"
ENT.Base = "base_gmodentity"
ENT.Category = "2D Classes"
ENT.PrintName = "Alcohol"
ENT.Spawnable = false
	



if SERVER then
	local models = {"models/foodnhouseholditems/beer_master.mdl",
	"models/foodnhouseholditems/beer_stoltz.mdl",
	"models/foodnhouseholditems/beercan01.mdl",
	"models/foodnhouseholditems/beercan02.mdl",
	"models/foodnhouseholditems/beercan03.mdl",
	"models/foodnhouseholditems/champagne.mdl",
	"models/foodnhouseholditems/champagne2.mdl",
	"models/foodnhouseholditems/champagne2b.mdl",
	"models/foodnhouseholditems/champagne3.mdl",
	"models/foodnhouseholditems/coconut_drink.mdl",
	"models/foodnhouseholditems/cola.mdl",
	"models/foodnhouseholditems/cola_swift1.mdl",
	"models/foodnhouseholditems/cola_swift2.mdl",
	"models/foodnhouseholditems/colabig.mdl",
	"models/foodnhouseholditems/juice.mdl",
	"models/foodnhouseholditems/juice2.mdl",
	"models/foodnhouseholditems/juice3.mdl",
	"models/foodnhouseholditems/juice4.mdl",
	"models/foodnhouseholditems/juicesmall.mdl",
	"models/foodnhouseholditems/mcddrink.mdl",
	"models/foodnhouseholditems/milk.mdl",
	"models/foodnhouseholditems/milk2.mdl",
	"models/foodnhouseholditems/sodacan01.mdl",
	"models/foodnhouseholditems/sodacan02.mdl",
	"models/foodnhouseholditems/sodacan03.mdl",
	"models/foodnhouseholditems/sodacan04.mdl",
	"models/foodnhouseholditems/sodacan05.mdl",
	"models/foodnhouseholditems/sodacan06.mdl",
	"models/foodnhouseholditems/sodacanb01.mdl",
	"models/foodnhouseholditems/sodacanb02.mdl",
	"models/foodnhouseholditems/sodacanb03.mdl",
	"models/foodnhouseholditems/sodacanb04.mdl",
	"models/foodnhouseholditems/sodacanc01.mdl",
	"models/foodnhouseholditems/sprunk1.mdl",
	"models/foodnhouseholditems/sprunk2.mdl",
	"models/foodnhouseholditems/wine_red1.mdl",
	"models/foodnhouseholditems/wine_red2.mdl",
	"models/foodnhouseholditems/wine_red3.mdl",
	"models/foodnhouseholditems/wine_rose1.mdl",
	"models/foodnhouseholditems/wine_rose2.mdl",
	"models/foodnhouseholditems/wine_white1.mdl",
	"models/foodnhouseholditems/wine_white2.mdl",
	"models/foodnhouseholditems/wine_white3.mdl",
	"models/foodnhouseholditems/winebottle1.mdl",
	"models/foodnhouseholditems/winebottle2.mdl",
	"models/foodnhouseholditems/winebottle3.mdl",
	"models/foodnhouseholditems/winebottle4.mdl"


}
function ENT:Initialize( )
		self:SetModel(models[math.random(1,47)])
    self:SetUseType(SIMPLE_USE)
    self:SetMoveType(MOVETYPE_VPHYSICS)
    self:PhysicsInit(SOLID_VPHYSICS)
    self:SetSolid( SOLID_VPHYSICS )

end
end


if SERVER then
	util.AddNetworkString('GetAlcohol')
	end
	
function ENT:Use(activator)
	if (activator:IsPlayer()) then
		net.Start("GetAlcohol")
		net.Send(activator)
		self:Remove()
	--local UI = vgui.Create("DLabelEditable")
end
end

function ENT:Draw()
	self:DrawModel()

end