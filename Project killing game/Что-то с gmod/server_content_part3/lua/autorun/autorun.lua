
if SERVER then
local files = file.Find ('server/*.lua','LUA')
table.foreach(files,function(key,gui)
include('server/'..gui)
end)
local files = file.Find ('client/*.lua','LUA')
table.foreach(files,function(key,gui)
AddCSLuaFile('client/'..gui)
end)


end


if CLIENT then
local files = file.Find ('client/*.lua','LUA')
table.foreach(files,function(key,gui)
include('client/'..gui)
end)
    
local function DisallowContextMenu( )
if not LocalPlayer():IsAdmin() and not LocalPlayer():IsSuperAdmin() then
return false
end
end
hook.Add( "ContextMenuOpen", "DisallowContextMenu", DisallowContextMenu)
end

print ('autorun has been autoruned')


	if SERVER then
	util.AddNetworkString("SendNudes")
	util.AddNetworkString("MakeProbBDA")
	util.AddNetworkString("GetKillerName1")
	util.AddNetworkString("SetKillerName1")
	
end

local function sosatb(Ent,i, path)
	net.Start("SendNudes")
	net.WriteTable({Ent,i,path})
	net.SendToServer()
end

	if SERVER then
net.Receive("MakeProbBDA", function ()
	local bool = net.ReadBool()
	local ent = net.ReadEntity()
	ent:SetNWBool("IsVictim", bool)
	end)
net.Receive("GetKillerName1", function ()
	local table = net.ReadTable()
	net.Start("GetKillerName")
	net.WriteTable(table)
	net.Send(table[3])
	end)
net.Receive("SetKillerName1", function ()
	local table = net.ReadTable()
	table[2]:SetNWString("KillerName", table[1])
	end)
net.Receive("SendNudes", function ()
	local Data = net.ReadTable()
	Data[1]:SetSubMaterial( Data[2], "plates/"..Data[3])
	end)
end
dr1name = {"Аой", "Бьякуя", "Селестия", "Чихиро", "Хифуми", "Джунко", "Киотака", "Кёко", "Леон", "Макото", "Мондо", "Мукуро", "Сакура", "Саяка", "Токо","Ясухиро"}
dr1path = {"aoi", "byakuya", "celestia", "chihiro","hifumi" ,"junko", "kiyotaka", "kyoko", "leon", "makoto", "mondo", "mukuro", "sakura","sayaka", "toko","hagakure"}
properties.Add( "dr1",
{
	MenuLabel	=	"THH",
	Order		=	605,
	MenuIcon	=	"icon16/car.png",

	Filter		=	function( self, ent, ply )

						if ( not IsValid( ent ) ) then return false end
						if ( not gamemode.Call( "CanProperty", ply, "dr1", ent ) ) then return false end
						if(ent:GetModel()~="models/models/deadplate/byakuya-dead.mdl" and ent:GetModel()~="models/models/deadplate/dr1portrait.mdl" and ent:GetModel()~="models/models/deadplate/portraitv3.mdl") then return false end
						return true

					end,

	MenuOpen	=	function(self, option, ent)
	local NewMenu = option:AddSubMenu()
	for i=1,16 do

						NewMenu:AddOption( dr1name[i], function() 
						if(ent:GetModel()=="models/models/deadplate/byakuya-dead.mdl" or ent:GetModel()=="models/models/deadplate/portraitv3.mdl") then
							sosatb(ent,4, dr1path[i])
						end
						if(ent:GetModel()=="models/models/deadplate/dr1portrait.mdl") then
							sosatb(ent,3, dr1path[i])
						end	end )
					end
					end,
	Receive		=	function( self, length, player )
					end

})

drv3name = {"Анджи", "Гонта", "Химико", "К1-В0", "Каеде", "Каито", "Кируми", "Кокичи", "Корекиё", "Маки", "Миу", "Рантаро", "Рёма", "Шуичи", "Тенко","Тсумуги"}
drv3path = {"angie", "gonta", "himiko", "k1b0","kaede" ,"kaito", "kirumi","kokichi","kork", "maki", "miu", "rantaro", "ryoma", "shuichi", "tenko","tsumugi"}


dr2name = {"Хаджиме", "Аканэ", "Бьякуя", "Гандам", "Ибуки", "Казуичи", "Махиру", "Микан", "Нагито", "Нэкомару", "Пеко", "Сония", "Тэрутэру", "Фуюхико", "Хиёко","Чиаки"}
dr2path = {"hajime", "akane", "imposter", "gundham","ibuki" ,"kazuichi", "mahiru", "mikan", "nagito", "nekomaru", "peko", "sonia", "teruteru","fuyuhiko", "hiyoko","chiaki"}

properties.Add( "dr2",
{
	MenuLabel	=	"GD",
	Order		=	606,
	MenuIcon	=	"icon16/car.png",

	Filter		=	function( self, ent, ply )

						if ( not IsValid( ent ) ) then return false end
						if ( not gamemode.Call( "CanProperty", ply, "dr2", ent ) ) then return false end
						if(ent:GetModel()~="models/models/deadplate/byakuya-dead.mdl" and ent:GetModel()~="models/models/deadplate/dr1portrait.mdl" and ent:GetModel()~="models/models/deadplate/portraitv3.mdl") then return false end
						return true

					end,

	MenuOpen	=	function(self, option, ent)
	local NewMenu = option:AddSubMenu()
	for i=1,16 do

						NewMenu:AddOption( dr2name[i], function() 
						if(ent:GetModel()=="models/models/deadplate/byakuya-dead.mdl" or ent:GetModel()=="models/models/deadplate/portraitv3.mdl") then
							sosatb(ent,4, dr2path[i])
						end
							if(ent:GetModel()=="models/models/deadplate/dr1portrait.mdl") then
							sosatb(ent,3, dr2path[i])
						end end)
					end
					end,
	Receive		=	function( self, length, player )
					end

})

properties.Add( "dr3",
{
	MenuLabel	=	"V3",
	Order		=	607,
	MenuIcon	=	"icon16/car.png",

	Filter		=	function( self, ent, ply )

						if ( not IsValid( ent ) ) then return false end
						if ( not gamemode.Call( "CanProperty", ply, "dr1", ent ) ) then return false end
						if(ent:GetModel()~="models/models/deadplate/byakuya-dead.mdl" and ent:GetModel()~="models/models/deadplate/dr1portrait.mdl" and ent:GetModel()~="models/models/deadplate/portraitv3.mdl") then return false end
						return true

					end,

	MenuOpen	=	function(self, option, ent)
	local NewMenu = option:AddSubMenu()
	for i=1,16 do

						NewMenu:AddOption( drv3name[i], function() 
						if(ent:GetModel()=="models/models/deadplate/byakuya-dead.mdl" or ent:GetModel()=="models/models/deadplate/portraitv3.mdl") then
							sosatb(ent,4, drv3path[i])
							
						end
						if(ent:GetModel()=="models/models/deadplate/dr1portrait.mdl") then
							sosatb(ent,3, drv3path[i])
						end	end )
					end
					end,
	Receive		=	function( self, length, player )
					end

})

sdra2name = {"Сора1", "Сора2", "Эмма", "Макуноучи", "Хибики", "Ироха", "Канаде", "Кокоро", "Микадо", "Никей", "Сецука", "Шинджи", "Шобай", "Теруя", "Йоруко","Юки", "Юри"}
sdra2path = {"sora1", "sora2", "emma", "makunouchi","hibiki" ,"iroha", "kanade", "kokoro", "mikado", "nikei", "setsuka", "shinji", "shobai","teruya", "yoruko","yuki","yuri"}

properties.Add( "sdra2",
{
	MenuLabel	=	"SDRA2",
	Order		=	609,
	MenuIcon	=	"icon16/car.png",

	Filter		=	function( self, ent, ply )

						if ( not IsValid( ent ) ) then return false end
						if ( not gamemode.Call( "CanProperty", ply, "sdra2", ent ) ) then return false end
						if(ent:GetModel()~="models/models/deadplate/byakuya-dead.mdl" and ent:GetModel()~="models/models/deadplate/dr1portrait.mdl" and ent:GetModel()~="models/models/deadplate/portraitv3.mdl") then return false end
						return true

					end,

	MenuOpen	=	function(self, option, ent)
	local NewMenu = option:AddSubMenu()
	for i=1,17 do

						NewMenu:AddOption( sdra2name[i], function() 
						if(ent:GetModel()=="models/models/deadplate/byakuya-dead.mdl" or ent:GetModel()=="models/models/deadplate/portraitv3.mdl") then
							sosatb(ent,4, sdra2path[i])
						end
							if(ent:GetModel()=="models/models/deadplate/dr1portrait.mdl") then
							sosatb(ent,3, sdra2path[i])
						end end)
					end
					end,
	Receive		=	function( self, length, player )
					end

})

rebname = {"Акира", "Аюму1", "Аюму2", "Арума", "Касуми", "Казуоми", "Кего", "Майко", "Марин", "Микото", "Мисузу", "Мицунари", "Наруми", "Нико", "Сайджи","Сейши"}
rebpath = {"akira", "ayumu1", "ayumu2", "aruma","kasumi" ,"kazuomi", "kego", "maiko", "marin", "mikoto", "misuzu", "mitsunari", "narumi","nico", "saiji","seishi"}

properties.Add( "rebirth",
{
	MenuLabel	=	"Rebirth",
	Order		=	610,
	MenuIcon	=	"icon16/car.png",

	Filter		=	function( self, ent, ply )

						if ( not IsValid( ent ) ) then return false end
						if ( not gamemode.Call( "CanProperty", ply, "rebirth", ent ) ) then return false end
						if(ent:GetModel()~="models/models/deadplate/byakuya-dead.mdl" and ent:GetModel()~="models/models/deadplate/dr1portrait.mdl" and ent:GetModel()~="models/models/deadplate/portraitv3.mdl") then return false end
						return true

					end,

	MenuOpen	=	function(self, option, ent)
	local NewMenu = option:AddSubMenu()
	for i=1,16 do

						NewMenu:AddOption( rebname[i], function() 
						if(ent:GetModel()=="models/models/deadplate/byakuya-dead.mdl" or ent:GetModel()=="models/models/deadplate/portraitv3.mdl") then
							sosatb(ent,4, rebpath[i])
						end
							if(ent:GetModel()=="models/models/deadplate/dr1portrait.mdl") then
							sosatb(ent,3, rebpath[i])
						end end)
					end
					end,
	Receive		=	function( self, length, player )
					end

})

fbname = {"Покет", "Грисп", "Кросс", "Энигма", "Анон", "Мораитеру", "Якси", "Рок", "Рокс", "Рисси", "Скарлет", "Твин", "Канцел", "Корза"}
fbpath = {"Pocket", "Grisp", "Cross", "Enigma","Anon" ,"Moraiteru", "Yaxi", "Rock", "Rox", "Rissi", "Scarlet", "Twin", "Cancel","Corza"}

properties.Add( "shattered",
{
	MenuLabel	=	"Shattered",
	Order		=	612,
	MenuIcon	=	"icon16/car.png",

	Filter		=	function( self, ent, ply )

						if ( not IsValid( ent ) ) then return false end
						if ( not gamemode.Call( "CanProperty", ply, "rebirth", ent ) ) then return false end
						if(ent:GetModel()~="models/models/deadplate/byakuya-dead.mdl" and ent:GetModel()~="models/models/deadplate/dr1portrait.mdl" and ent:GetModel()~="models/models/deadplate/portraitv3.mdl") then return false end
						return true

					end,

	MenuOpen	=	function(self, option, ent)
	local NewMenu = option:AddSubMenu()
	for i=1,14 do

						NewMenu:AddOption( fbname[i], function() 
						if(ent:GetModel()=="models/models/deadplate/byakuya-dead.mdl" or ent:GetModel()=="models/models/deadplate/portraitv3.mdl") then
							sosatb(ent,4, fbpath[i])
						end
							if(ent:GetModel()=="models/models/deadplate/dr1portrait.mdl") then
							sosatb(ent,3, fbpath[i])
						end end)
					end
					end,
	Receive		=	function( self, length, player )
					end

})

genname = {"Альбедо", "Бейдоу", "Чунь Юнь", "Дилюк", "Фишль", "Хутао", "Кэйа", "Кэ Цин", "Кли", "Мона", "Нин Гуан", "Цици", "Рэйзор", "Розария", "Скарамуча","Сахароза","Тарталья","Венти","Син Цю","Чжун Ли"}
genpath = {"albedo", "beidou", "chongyun", "diluc","fischl" ,"hutao", "kaeya", "keqing", "klee", "mona", "ningguang", "qiqi", "razor","rosaria", "scar","sucrose","tartaglia","venti","xingqiu","zhongli"}

properties.Add( "genshin",
{
	MenuLabel	=	"Genshin",
	Order		=	611,
	MenuIcon	=	"icon16/car.png",

	Filter		=	function( self, ent, ply )

						if ( not IsValid( ent ) ) then return false end
						if ( not gamemode.Call( "CanProperty", ply, "genshin", ent ) ) then return false end
						if(ent:GetModel()~="models/models/deadplate/byakuya-dead.mdl" and ent:GetModel()~="models/models/deadplate/dr1portrait.mdl" and ent:GetModel()~="models/models/deadplate/portraitv3.mdl") then return false end
						return true

					end,

	MenuOpen	=	function(self, option, ent)
	local NewMenu = option:AddSubMenu()
	for i=1,20 do

						NewMenu:AddOption( genname[i], function() 
						if(ent:GetModel()=="models/models/deadplate/byakuya-dead.mdl" or ent:GetModel()=="models/models/deadplate/portraitv3.mdl") then
							sosatb(ent,4, genpath[i])
						end
							if(ent:GetModel()=="models/models/deadplate/dr1portrait.mdl") then
							sosatb(ent,3, genpath[i])
						end end)
					end
					end,
	Receive		=	function( self, length, player )
					end

})
local Player
properties.Add( "bda",
{
	MenuLabel	=	"Make Victim",
	Order		=	612,
	MenuIcon	=	"sprites/ui/icons/monokuma2.png",
	Filter		=	function( self, ent, ply )
	Player = ply
						if ( not IsValid( ent ) ) then return false end
						if ( not gamemode.Call( "CanProperty", ply, "bda", ent ) ) then return false end
						if ent:GetClass() ~= "prop_ragdoll" then return false end
						return true

					end,

	MenuOpen	=	function(self, option, ent)
	local NewMenu = option:AddSubMenu()
	NewMenu:AddOption("Make Victim", function() 
		net.Start("MakeProbBDA")
		net.WriteBool(true)
		net.WriteEntity(ent)
		net.SendToServer()
		--ent:SetNWBool("IsVictim", true)
		--print(ent:GetNWBool("IsVictim"))
		end)
	NewMenu:AddOption("Make Simple Prob", function() 
		net.Start("MakeProbBDA")
		net.WriteBool(false)
		net.WriteEntity(ent)
		net.SendToServer()
		--ent:SetNWBool("IsVictim", false)
		--print(ent:GetNWBool("IsVictim"))
		end)
	NewMenu:AddOption("Set Killer", function() 
		net.Start("GetKillerName1")
		net.WriteTable({ent:GetNWString("KillerName"),ent,Player})
		net.SendToServer()
		end)
	--[[for i=1,20 do

						NewMenu:AddOption( genname[i], function() 
						if(ent:GetModel()=="models/models/deadplate/byakuya-dead.mdl" or ent:GetModel()=="models/models/deadplate/portraitv3.mdl") then
							sosatb(ent,4, genpath[i])
						end
							if(ent:GetModel()=="models/models/deadplate/dr1portrait.mdl") then
							sosatb(ent,3, genpath[i])
						end end)
					end]]
					end,
	Receive		=	function( self, length, player )
					end

})

properties.Add( "GetPosAngles",
{
	MenuLabel	=	"GetPos",
	Order		=	605,
	MenuIcon	=	"icon16/car.png",

	Filter		=	function( self, ent, ply )

						if ( not IsValid( ent ) ) then return false end
						if ( not gamemode.Call( "CanProperty", ply, "dr1", ent ) ) then return false end
						return true

					end,

	MenuOpen	=	function(self, option, ent)
	local NewMenu = option:AddSubMenu()
	NewMenu:AddOption("Pos", function() 
		print(ent:GetPos())
		end)
	NewMenu:AddOption("Angles", function() 
		print(ent:GetAngles())
		end)
					end,
	Receive		=	function( self, length, player )
					end

})







properties.Add( "uglyMoment",
{
	MenuLabel	=	"UglyMoment",
	Order		=	605,
	MenuIcon	=	"icon16/car.png",

	Filter		=	function( self, ent, ply )

						if ( not IsValid( ent ) ) then return false end
						if ( not gamemode.Call( "CanProperty", ply, "dr1", ent ) ) then return false end
						return true

					end,

	Action = function( self, ent ) 

		self:MsgStart()
			net.WriteEntity( ent )
		self:MsgEnd()

	end,

	Receive		=	function( self, length, player )
		local ent = net.ReadEntity()
		ent:SetMaterial("models/dewobedil/danganronpa/kirumi_tojo/toon2")
					end

})