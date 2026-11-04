if (SERVER)then
	AddCSLuaFile("Evidence.lua")
end
local draw = false
ENT.Type = "anim"
ENT.Base = "base_gmodentity"
ENT.Category = "2D Classes"
ENT.PrintName = "Evidence"
ENT.Spawnable = true
ENT.Editable = true
	
function ENT:SetupDataTables()

	self:NetworkVar( "String",	0, "Evidence",	{ KeyName = "Evidence",	Edit = { type = "String", order = 0} } )
    self:NetworkVar( "Int",	1, "Vision",	{ KeyName = "Vision",	Edit = { type = "Int", order = 1, min = 1, max = 20} } )
	self:NetworkVar( "String",	2, "HTMLPath",	{ KeyName = "HTMLPath",	Edit = { type = "String", order = 2} } )
	self:NetworkVar( "String",	3, "BigHTMLPath",	{ KeyName = "BigHTMLPath",	Edit = { type = "String", order = 3} } )
	self:NetworkVar( "String",	1, "IconPath",	{ KeyName = "IconPath",	Edit = { type = "String", order = 4} } )
	
if ( SERVER ) then
	self:NetworkVarNotify( "Evidence", self.OnCharacterNameChanged )
    self:NetworkVarNotify( "Vision", self.OnCharacterNameChanged )
	end
end

local Observation = 5
function GetObservation()
	local	PlayerName = LocalPlayer():Nick()
	local PlayerSleep = LocalPlayer():GetNWString("PlayerSleep", 1)
if PlayerName == "Макото Наеги" or PlayerName == "Макото Наэги" then 
	Observation = 6
		elseif (PlayerName == "Акане Овари" or PlayerName == "Аканэ Овари") then 
		Observation = 5
		elseif (PlayerName == "Анджи Йонага" or PlayerName == "Анджи Ёнага") then 
		Observation = 6
		elseif PlayerName == "Аой Асахина" then 
		Observation = 4
		elseif PlayerName == "Чиаки Нанами" then 
		Observation = 7
		elseif (PlayerName == "Селестия Люденбург" or PlayerName == "Селестия Люденбёрг" or PlayerName == "Селестия Люденберг") then 
		Observation = 7.5
		elseif PlayerName == "Бьякуя Тогами" then 
		Observation = 9
        elseif PlayerName == "Импостер" then 
		Observation = 8
		elseif PlayerName == "Чихиро Фуджисаки" then 
		Observation = 5
		elseif PlayerName == "Фуюхико Кузурю" then 
		Observation = 6
		elseif PlayerName == "Гонта Гокухара" then 
		Observation = 3
		elseif PlayerName == "Гандам Танака" then 
		Observation = 6
		elseif (PlayerName == "Хаджиме Хината" or PlayerName == "Хадзиме Хината") then 
		Observation = 6
		elseif (PlayerName == "Изуру Камакура") then 
		Observation = 10
		elseif PlayerName == "Хифуми Ямада" then 
		Observation = 3
		elseif PlayerName == "Химико Юмено" then 
		Observation = 2
		elseif (PlayerName == "Хиёко Сайонджи" or PlayerName == "Хиёко Сайондзи")then 
		Observation = 5
		elseif PlayerName == "Ибуки Миода" then 
		Observation = 3
		elseif PlayerName == "Джунко Эношима" then 
		Observation = 9
        elseif PlayerName == "Мукуро Икусаба" then 
		Observation = 6
		elseif (PlayerName == "K1-B0" or PlayerName == "Киибо" or PlayerName == "Кибо") then 
		Observation = 8
		elseif (PlayerName == "Каедэ Акаматсу" or PlayerName == "Каэдэ Акаматсу") then 
		Observation = 5
		elseif (PlayerName == "Кайто Момота" or PlayerName == "Каито Момота") then 
		Observation = 5
		elseif (PlayerName == "Казуичи Сода" or PlayerName == "Казуити Сода") then 
		Observation = 7
		elseif PlayerName == "Кируми Тоджо" then 
		Observation = 8
		elseif (PlayerName == "Киётака Ишимару" or PlayerName == "Кийотака Ишимару") then 
		Observation = 5
		elseif PlayerName == "Кокичи Ома" then 
		Observation = 9
		elseif (PlayerName == "Корекиё Шингуджи" or PlayerName == "Корекиё Шингудзи" or PlayerName == "Корекие Шингуджи" or PlayerName == "Корекие Шингудзи") then 
		Observation = 8
		elseif PlayerName == "Кёко Киригири" then 
		Observation = 10
		elseif PlayerName == "Леон Кувата" then 
		Observation = 5
		elseif (PlayerName == "Махиру Коидзуми" or PlayerName == "Махиру Коизуми") then 
		Observation = 6
		elseif PlayerName == "Маки Харукава" then 
		Observation = 9
		elseif (PlayerName == "Микан Тсумики" or PlayerName == "Микан Цумики") then 
		Observation = 10
		elseif PlayerName == "Миу Ирума" then 
		Observation = 4
		elseif PlayerName == "Мондо Овада" then 
		Observation = 3
		elseif (PlayerName == "Нагито Комаеда" or PlayerName == "Нагито Комаэда") then 
		Observation = 9
		elseif PlayerName == "Некомару Нидай" then 
		Observation = 5
		elseif PlayerName == "Пеко Пекояма" then 
		Observation = 7
		elseif PlayerName == "Рантаро Амами" then 
		Observation = 7
		elseif PlayerName == "Рёма Хоши" then 
		Observation = 7
		elseif PlayerName == "Сакура Огами" then 
		Observation = 6
		elseif (PlayerName == "Саяка Маизоно" or PlayerName == "Саяка Майзоно") then 
		Observation = 5
		elseif (PlayerName == "Шуичи Саихара" or PlayerName == "Шуичи Сайхара") then 
		Observation = 10
		elseif (PlayerName == "Сония Невермайнд" or PlayerName == "Соня Невермайнд" or PlayerName == "Сонья Невермайнд") then 
		Observation = 6
		elseif PlayerName == "Тенко Чабашира" then 
		Observation = 3
		elseif PlayerName == "Терутеру Ханамура" then 
		Observation = 6
		elseif PlayerName == "Токо Фукава" then 
		Observation = 6.5
		elseif (PlayerName == "Тсумуги Широгане" or PlayerName == "Цумуги Широгане" or PlayerName == "Тсумуги Широганэ" or PlayerName == "Цумуги Широганэ") then 
		Observation = 5
		elseif (PlayerName == "Ясухиро Кагакурэ" or PlayerName == "Ясухиро Хагакурэ" or PlayerName == "Ясухиро Кагакуре" or PlayerName == "Ясухиро Хагакуре") then 
		Observation = 5
        elseif PlayerName == "Комару Наеги" then 
		Observation = 5
        elseif PlayerName == "Рёко Отонаши" then 
		Observation = 11
        elseif PlayerName == "Рёта Митарай" then 
		Observation = 7
        elseif PlayerName == "Юри Кагарин" then 
		Observation = 9
        elseif PlayerName == "Хаджиме Макуноучи" then 
		Observation = 4
        elseif PlayerName == "Кокоро Митсуме" then 
		Observation = 10
        elseif PlayerName == "Эмма Магороби" then 
		Observation = 6
        elseif PlayerName == "Сетсука Чибукуро" then 
		Observation = 8
        elseif PlayerName == "Хибики Отонокоджи" then 
		Observation = 2
        elseif PlayerName == "Канаде Отонокоджи" then 
		Observation = 10
        elseif PlayerName == "Никей Йомиури" then 
		Observation = 8
        elseif PlayerName == "Шинджи Касай" then 
		Observation = 3
        elseif PlayerName == "Теруя Отори" then 
		Observation = 5
        elseif PlayerName == "Ироха Ниджиуэ" then 
		Observation = 3
        elseif PlayerName == "Сора" then 
		Observation = 6
        elseif PlayerName == "Юки Маеда" then 
		Observation = 5
        elseif PlayerName == "Микадо Санноджи" then 
		Observation = 7
        elseif PlayerName == "Шобай Хашимото" then 
		Observation = 10
        elseif PlayerName == "Йоруко Кабуя" then 
		Observation = 4
        elseif PlayerName == "Сейко Кимуро" then 
		Observation = 9
        elseif PlayerName == "Аюму Фуджимори" then 
		Observation = 5
        elseif PlayerName == "Акира Тсучия" then 
		Observation = 5
        elseif PlayerName == "Арума Тодороки" then 
		Observation = 4
        elseif PlayerName == "Касуми Изумо" then 
		Observation = 6
        elseif PlayerName == "Казуоми Самеджима" then 
		Observation = 4
        elseif PlayerName == "Кего Сакума" then 
		Observation = 6
        elseif PlayerName == "Майко Кагура" then 
		Observation = 3
        elseif PlayerName == "Марин Мизута" then 
		Observation = 3
        elseif PlayerName == "Микото Итсуки" then 
		Observation = 9
        elseif PlayerName == "Мисузу Аисака" then 
		Observation = 6
        elseif PlayerName == "Мицунари Кога" then 
		Observation = 3
        elseif PlayerName == "Наруми Осоне" then 
		Observation = 5
        elseif PlayerName == "Нико Химура" then 
		Observation = 6
        elseif PlayerName == "Cайджи Рокудо" then 
		Observation = 5
        elseif PlayerName == "Сейши Йодогава" then 
		Observation = 9.5
        elseif PlayerName == "Йоши Симудзу" then 
		Observation = 4.5
        elseif PlayerName == "Мисаки Хомма" then 
		Observation = 6
        elseif PlayerName == "Йоширо Тогучи" then 
		Observation = 5
        elseif PlayerName == "Рикуто Минами" then 
		Observation = 8
        elseif PlayerName == "Аюми Хирано" then 
		Observation = 5
        elseif PlayerName == "Мари Цудзи" then 
		Observation = 7
        elseif PlayerName == "Нана Игараси" then 
		Observation = 5
        elseif PlayerName == "Хидеёси Сигуяма" then 
		Observation = 5
        elseif PlayerName == "Кохару Китамура" then 
		Observation = 7
        elseif PlayerName == "Торо Хаттори" then 
		Observation = 5
        elseif PlayerName == "Хидеки Такада" then 
		Observation = 6.5
        elseif PlayerName == "Йоко Нагата" then 
		Observation = 5.5
        elseif PlayerName == "Рюдзи Гото" then 
		Observation = 6
        elseif PlayerName == "Шу Ямамото" then 
		Observation = 7
        elseif PlayerName == "Кермит Невилл" then 
		Observation = 6
        elseif PlayerName == "Сецуко Хиросэ" then 
		Observation = 4.5
                            elseif PlayerName == "Энигма" then 
        Observation = 6
                    elseif PlayerName == "Мораитеру" then 
        Observation = 4
                    elseif PlayerName == "Канцел" then 
        Observation = 5
                    elseif PlayerName == "Кросс" then 
        Observation = 9
                    elseif PlayerName == "Рокс" then 
        Observation = 8
                    elseif PlayerName == "Рок" then 
        Observation = 5
                    elseif PlayerName == "Анон" then 
        Observation = 6
                    elseif PlayerName == "Скарлет" then 
        Observation = 6
                    elseif PlayerName == "Покет" then 
        Observation = 2
                    elseif PlayerName == "Корза" then 
        Observation = 8
                    elseif PlayerName == "Рисси" then 
        Observation = 6.5
                    elseif PlayerName == "Твин" then 
        Observation = 4
                    elseif PlayerName == "Якси" then 
        Observation = 3
                    elseif PlayerName == "Грисп" then 
        Observation = 5
        else
		Observation = 5
		end
		Observation = Observation * PlayerSleep
		Observation = Observation + LocalPlayer():GetNWFloat("ObservationAdd")
		return (Observation)
		end
	EvidencesText = {}
if SERVER then

function ENT:Initialize( )
        self:SetVision(5)
		self:SetModel("models/hunter/blocks/cube025x025x025.mdl")
    self:SetUseType(SIMPLE_USE)
    self:SetMoveType(MOVETYPE_VPHYSICS)
    self:PhysicsInit(SOLID_VPHYSICS)
    self:SetSolid( SOLID_VPHYSICS )
    self:SetMaterial("aaa/empty")
    self:SetCollisionGroup(20)
    EvidencesText[self] = ""
        

end
end
function ENT:OnIconTextChanged( varname, oldvalue, newvalue )

	-- Do not rebuild if the size wasn't changed
	if ( oldvalue == newvalue ) then return end

	self.name = newvalue
	local SelfName = self:GetIconText()
end
function ENT:OnEvidenceChanged( varname, oldvalue, newvalue )

	-- Do not rebuild if the size wasn't changed
	if ( oldvalue == newvalue ) then return end

	self.name = newvalue
	local SelfName = self:GetEvidence()
end
if SERVER then

	util.AddNetworkString("GetEvidence")
	util.AddNetworkString("GetEvidenceHTMLPath")
	util.AddNetworkString("SetEvidence")
	util.AddNetworkString("StartDraw")
	util.AddNetworkString("EndDraw")
	util.AddNetworkString("SendEvidenceByLookForIt")
	util.AddNetworkString("SendEvidenceByLookForIt2")
	util.AddNetworkString("GetEvidenceSlots")
	util.AddNetworkString("GetEvidenceIcon")
end
function ENT:Use(activator)
	if (activator:IsPlayer() and activator:IsSuperAdmin()) then
		net.Start("GetEvidence")
		net.WriteTable({self:GetEvidence(),self:GetHTMLPath(),self:GetBigHTMLPath(),self:GetIconPath()})
		net.WriteString(EvidencesText[self])
		net.WriteEntity(self)
		net.Send(activator)


	--local UI = vgui.Create("DLabelEditable")
end
end
local text
local ent
if SERVER then

net.Receive("SendEvidenceByLookForIt", function(len, ply)
	local ent = net.ReadEntity()
	net.Start("SendEvidenceByLookForIt2")
	net.WriteString(EvidencesText[ent])
	net.WriteEntity(ent)
	net.Send(ply)
end)

net.Receive("GetEvidenceIcon", function(len,ply)
	local ent = net.ReadEntity() 
	net.Start("GetEvidenceSlots")
	net.WriteTable({ent:GetEvidence(),ent:GetHTMLPath(),ent:GetBigHTMLPath(),ent:GetIconPath()})
	net.WriteString(EvidencesText[ent])
	net.Send(ply)
end)

net.Receive("SetEvidence", function()
	text = net.ReadString()
	ent = net.ReadEntity()
	--print(text)
	ent:SetEvidence(text)
	EvidencesText[ent] = text
	--print(ent:GetEvidence())
	--ent:SetNWString("EvidenceText", text)	
end)
end
net.Receive("EndDraw", function()
	draw = false	
end)

local WE
function ENT:Think()
    
	WE = self:GetPos()
	if (ent == self) then
		self:SetEvidence(text)
	end

end
local RangeMultiple = 5

function ENT:Draw()
   -- local scrw, scrh = ScrW(), ScrH()
    self:DrawModel()
    GetObservation()
    local dist = LocalPlayer():GetPos():Distance(self:GetPos())
    local drawdist = Observation * RangeMultiple * self:GetVision() * 1.5
    if LocalPlayer():IsSuperAdmin() or (dist < drawdist) then
        local pos = self:GetPos()
        pos:ToScreen()
        cam.Start2D()
        pos = pos:ToScreen()
        surface.SetMaterial(Material("sprites/ui/world/circle"))
        surface.SetDrawColor(Color(255,255,255,255))
        if LocalPlayer():IsSuperAdmin() then 
        	surface.DrawTexturedRect(pos.x-8,pos.y-8,16,16)
        else
        	surface.DrawTexturedRect(pos.x-16*(1 - dist/drawdist),pos.y-16*(1 - dist/drawdist),32*(1 - dist/drawdist),32*(1 - dist/drawdist))
        end
        cam.End2D()

       
		--[[if !LocalPlayer():IsSuperAdmin() and (LocalPlayer():GetPos():Distance(self:GetPos()))>Observation * RangeMultiple * self:GetVision() then 
			else
	
	local pos = self:GetPos()+Vector(0,0, -5)
	local ang = self:GetAngles()
	local count = self:GetCount()
	cam.Start3D2D(pos,ang, 0.1)
surface.SetMaterial(Material("Icon/"..count))
surface.SetDrawColor(255,255,255,255)
surface.DrawTexturedRect(-50, -50, 100, 100)
cam.End3D2D()]]
end
end





net.Receive("StartDraw", function()
	draw = true	
	GetObservation()
end)