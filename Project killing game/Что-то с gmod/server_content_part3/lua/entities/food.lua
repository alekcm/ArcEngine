if (SERVER)then
	AddCSLuaFile("food.lua")
end

ENT.Type = "anim"
ENT.Base = "base_gmodentity"
ENT.Category = "2D Classes"
ENT.PrintName = "Food"
ENT.Spawnable = false
	



if SERVER then
	local models = {"models/themask/scenebuildthemes/groceries/apple_m.mdl", 
	"models/themask/scenebuildthemes/groceries/apple_01.mdl", 
	"models/props_everything/pineapple.mdl", 
	"models/foodnhouseholditems/bacon.mdl",
	"models/foodnhouseholditems/bacon_2.mdl",
	"models/foodnhouseholditems/baconcooked.mdl",
	"models/props_everything/applered.mdl", 
	"models/props_everything/applegreen.mdl", 
	"models/foodnhouseholditems/pineapple.mdl", 
	"models/foodnhouseholditems/apple2.mdl", 
	"models/foodnhouseholditems/apple.mdl", 
	"models/foodnhouseholditems/apple1.mdl",
	"models/foodnhouseholditems/applejacks.mdl",
	"models/foodnhouseholditems/bagel1.mdl",
	"models/foodnhouseholditems/bagel2.mdl",
	"models/foodnhouseholditems/bagel3.mdl",
	"models/foodnhouseholditems/bagette.mdl",
	"models/foodnhouseholditems/bananna.mdl",
	"models/foodnhouseholditems/bananna_bunch.mdl",
	"models/foodnhouseholditems/bread-1.mdl",
	"models/foodnhouseholditems/bread-2.mdl",
	"models/foodnhouseholditems/bread-3.mdl",
	"models/foodnhouseholditems/bread-4.mdl",
	"models/foodnhouseholditems/bread_half.mdl",
	"models/foodnhouseholditems/bread_loaf.mdl",
	"models/foodnhouseholditems/burgersims2.mdl",
	"models/foodnhouseholditems/cabbage1.mdl",
	"models/foodnhouseholditems/cabbage2.mdl",
	"models/foodnhouseholditems/cabbage3.mdl",
	"models/foodnhouseholditems/cake.mdl",
	"models/foodnhouseholditems/cheerios.mdl",
	"models/foodnhouseholditems/cheesewheel1a.mdl",
	"models/foodnhouseholditems/cheesewheel2a.mdl",
	"models/foodnhouseholditems/chicken_wrap.mdl",
	"models/foodnhouseholditems/chipsbag1.mdl",
	"models/foodnhouseholditems/chipsbag2.mdl",
	"models/foodnhouseholditems/chipsbag3.mdl",
	"models/foodnhouseholditems/chipscheezit.mdl",
	"models/foodnhouseholditems/chipslays.mdl",
	"models/foodnhouseholditems/chipsdoritos.mdl",
	"models/foodnhouseholditems/chipsdoritos2.mdl",
	"models/foodnhouseholditems/chipsdoritos3.mdl",
	"models/foodnhouseholditems/chipsdoritos4.mdl",
	"models/foodnhouseholditems/chipsdoritos5.mdl",
	"models/foodnhouseholditems/chipsdoritos6.mdl",
	"models/foodnhouseholditems/chipsfritos.mdl",
	"models/foodnhouseholditems/chipsfritosbbq.mdl",
	"models/foodnhouseholditems/chipsfritoshoops.mdl",
	"models/foodnhouseholditems/chipsfritostwists.mdl",
	"models/foodnhouseholditems/chipslays2.mdl",
	"models/foodnhouseholditems/chipslays3.mdl",
	"models/foodnhouseholditems/chipslays4.mdl",
	"models/foodnhouseholditems/chipslays5.mdl",
	"models/foodnhouseholditems/chipslays6.mdl",
	"models/foodnhouseholditems/chipslays7.mdl",
	"models/foodnhouseholditems/chipslays8.mdl",
	"models/foodnhouseholditems/chipstropical.mdl",
	"models/foodnhouseholditems/chipstwisties.mdl",
	"models/foodnhouseholditems/chocolatine.mdl",
	"models/foodnhouseholditems/chocorings.mdl",
	"models/foodnhouseholditems/coconut.mdl",
	"models/foodnhouseholditems/cokopops.mdl",
	"models/foodnhouseholditems/cookies.mdl",
	"models/foodnhouseholditems/corn.mdl",
	"models/foodnhouseholditems/croissant.mdl",
	"models/foodnhouseholditems/digestive.mdl",
	"models/foodnhouseholditems/digestive2.mdl",
	"models/foodnhouseholditems/donut.mdl",
	"models/foodnhouseholditems/egg.mdl",
	"models/foodnhouseholditems/eggplant.mdl",
	"models/foodnhouseholditems/fishbass.mdl",
	"models/foodnhouseholditems/fishcatfish.mdl",
	"models/foodnhouseholditems/fishgolden.mdl",
	"models/foodnhouseholditems/fishrainbow.mdl",
	"models/foodnhouseholditems/fishsteak.mdl",
	"models/foodnhouseholditems/gourd.mdl",
	"models/foodnhouseholditems/grapes1.mdl",
	"models/foodnhouseholditems/grapes2.mdl",
	"models/foodnhouseholditems/grapes3.mdl",
	"models/foodnhouseholditems/honey_jar.mdl",
	"models/foodnhouseholditems/hotdog.mdl",
	"models/foodnhouseholditems/icecream.mdl",
	"models/foodnhouseholditems/icecream1.mdl",
	"models/foodnhouseholditems/icecream2.mdl",
	"models/foodnhouseholditems/icecream3.mdl",
	"models/foodnhouseholditems/icecream4.mdl",
	"models/foodnhouseholditems/icecream5.mdl",
	"models/foodnhouseholditems/icecream6.mdl",
	"models/foodnhouseholditems/kindersurprise.mdl",
	"models/foodnhouseholditems/leek.mdl",
	"models/foodnhouseholditems/lettuce.mdl",
	"models/foodnhouseholditems/lobster.mdl",
	"models/foodnhouseholditems/marabou1.mdl",
	"models/foodnhouseholditems/marabou2.mdl",
	"models/foodnhouseholditems/marabou3.mdl",
	"models/foodnhouseholditems/marabou4.mdl",
	"models/foodnhouseholditems/mcdburger.mdl",
	"models/foodnhouseholditems/mcdfrenchfries.mdl",
	"models/foodnhouseholditems/mcdfriedchickenleg.mdl",
	"models/foodnhouseholditems/meat6.mdl",
	"models/foodnhouseholditems/meat8.mdl",
	"models/foodnhouseholditems/meat9b.mdl",
	"models/foodnhouseholditems/meat_ribs.mdl",
	"models/foodnhouseholditems/miniwheats.mdl",
	"models/foodnhouseholditems/nutella.mdl",
	"models/foodnhouseholditems/orange.mdl",
	"models/foodnhouseholditems/pancakes.mdl",
	"models/foodnhouseholditems/pandapuffs.mdl",
	"models/foodnhouseholditems/peanut_butter.mdl",
	"models/foodnhouseholditems/pear.mdl",
	"models/foodnhouseholditems/pepper1.mdl",
	"models/foodnhouseholditems/pepper2.mdl",
	"models/foodnhouseholditems/pepper3.mdl",
	"models/foodnhouseholditems/picklejar.mdl",
	"models/foodnhouseholditems/pie.mdl",
	"models/foodnhouseholditems/piranha.mdl",
	"models/foodnhouseholditems/pizza.mdl",
	"models/foodnhouseholditems/potato.mdl",
	"models/foodnhouseholditems/pretzel.mdl",
	"models/foodnhouseholditems/pumpkin01.mdl",
	"models/foodnhouseholditems/salmon.mdl",
	"models/foodnhouseholditems/sandwich.mdl",
	"models/foodnhouseholditems/steak2.mdl",
	"models/foodnhouseholditems/sweetroll.mdl",
	"models/foodnhouseholditems/toast.mdl",
	"models/foodnhouseholditems/toblerone.mdl",
	"models/foodnhouseholditems/toffifee.mdl",
	"models/foodnhouseholditems/tomato.mdl",
	"models/foodnhouseholditems/turkey.mdl",
	"models/foodnhouseholditems/turkeyleg.mdl",
	"models/foodnhouseholditems/watermelon_unbreakable.mdl"

}
function ENT:Initialize( )
		self:SetModel(models[math.random(1,131)])
    self:SetUseType(SIMPLE_USE)
    self:SetMoveType(MOVETYPE_VPHYSICS)
    self:PhysicsInit(SOLID_VPHYSICS)
    self:SetSolid( SOLID_VPHYSICS )

end
end


if SERVER then
	util.AddNetworkString('GetFood')
	end
	
function ENT:Use(activator)
	if (activator:IsPlayer()) then
		net.Start("GetFood")
		net.Send(activator)
		self:Remove()
	--local UI = vgui.Create("DLabelEditable")
end
end

function ENT:Draw()
	self:DrawModel()

end