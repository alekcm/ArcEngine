local kost = true
local ModelFrame = nil
local BodyFrame = nil
local GamMod = "0"
local ButtonTables ={}

local function CharButton(ChButton,w1,h1,w2,h2,ch,charact,father,visible)
    ChButton:SetPos(ScrW()/w1, ScrH()/h1)
    ChButton:SetSize(ScrW()/w2, ScrH()/h2)
    ChButton:SetImage( "Selector/"..charact.."Select.png" )
    ChButton:SetVisible(visible)
    ChButton.DoClick = function()
    surface.PlaySound("charactermenu/Chose.mp3")
        net.Start("Select")
        net.WriteString(LocalPlayer():SteamID() .." "..ch)
        net.SendToServer()
        father:Remove()
    end
    ChButton.OnCursorEntered = function() 
        surface.PlaySound("charactermenu/Pick.mp3")
        ChButton:SetAlpha(200)
    end
    ChButton.OnCursorExited = function()
        ChButton:SetAlpha(255)
    end
end

function Buttons(But,vis)
	for k,v in pairs(But) do
		v:SetVisible(vis)
	end
end

DermaB = {}
GD = {}
KH = {}
DG = {}
SA2 = {}
Mono = {}

net.Receive('CharSelector', function()
        local bl = net.ReadBool()
local page = 0;
if (kost==true) then
kost = false
local i = 0
local chrSelector = vgui.Create( "DFrame" )
chrSelector:SetSize( ScrW(), ScrH())
chrSelector:Center()
chrSelector:MakePopup()
chrSelector:ShowCloseButton(false)
chrSelector:SetScreenLock(false)
chrSelector:SetDraggable(false)
	
            if bl then
                        local closeButton = vgui.Create("DButton", chrSelector)
            closeButton:SetSize(100,70)
            closeButton:SetPos(ScrW()-100,0)
            closeButton.DoClick = function()
                chrSelector:Remove()
                end
                end
            
            
local backImage = vgui.Create("DImage", chrSelector)
backImage:SetSize(chrSelector:GetSize())		
backImage:SetImage("Selector/HomeScreen.png")

local welcomeImage = vgui.Create("DImage", chrSelector)
welcomeImage:SetPos(ScrW()/5, ScrH()/10)
welcomeImage:SetSize(ScrW()/1.8, ScrH()/7)		
welcomeImage:SetImage("Selector/Welcome.png")

local despairImage = vgui.Create("DImage", chrSelector)
despairImage:SetPos(ScrW()/1.7, ScrH()/4.5)
despairImage:SetSize(ScrW()/3.5, ScrH()/3.5)		
despairImage:SetImage("Selector/Despair.png")

local monokumaButton = vgui.Create("DImageButton", chrSelector)
monokumaButton:SetPos(ScrW()/1.38, ScrH()/1.55)
monokumaButton:SetSize(ScrW()/4, ScrH()/4)
monokumaButton:SetImage( "Selector/Monokuma.png" )
monokumaButton.OnCursorEntered = function()
    surface.PlaySound("charactermenu/Pick.mp3")
	monokumaButton:SetAlpha(200)
end
monokumaButton.OnCursorExited = function()
	monokumaButton:SetAlpha(255)
end

local listDanganronpaImage = vgui.Create("DImage", chrSelector)
listDanganronpaImage:SetPos(ScrW()/12, ScrH()/3.8)
listDanganronpaImage:SetSize(ScrW()/2.1, ScrH()/1.63)		
listDanganronpaImage:SetImage("Selector/listDR.png")

local firstRonpaButton = vgui.Create("DImageButton", chrSelector)
firstRonpaButton:SetPos(ScrW()/11.2, ScrH()/3.2)
firstRonpaButton:SetSize(ScrW()/4.4, ScrH()/8)
firstRonpaButton:SetImage( "Selector/THH.png" )
firstRonpaButton.OnCursorEntered = function()
    surface.PlaySound("charactermenu/Pick.mp3")
	firstRonpaButton:SetAlpha(200)
end
firstRonpaButton.OnCursorExited = function()
	firstRonpaButton:SetAlpha(255)
end

local secondRonpaButton = vgui.Create("DImageButton", chrSelector)
secondRonpaButton:SetPos(ScrW()/11.2, ScrH()/2.2)
secondRonpaButton:SetSize(ScrW()/4.4, ScrH()/8)
secondRonpaButton:SetImage( "Selector/GD.png" )
secondRonpaButton.OnCursorEntered = function()
    surface.PlaySound("charactermenu/Pick.mp3")
	secondRonpaButton:SetAlpha(200)
end
secondRonpaButton.OnCursorExited = function()
	secondRonpaButton:SetAlpha(255)
end

local thirdRonpaButton = vgui.Create("DImageButton", chrSelector)
thirdRonpaButton:SetPos(ScrW()/11.2, ScrH()/1.675)
thirdRonpaButton:SetSize(ScrW()/4.4, ScrH()/8)
thirdRonpaButton:SetImage( "Selector/V3.png" )
thirdRonpaButton.OnCursorEntered = function()
    surface.PlaySound("charactermenu/Pick.mp3")
	thirdRonpaButton:SetAlpha(200)
end
thirdRonpaButton.OnCursorExited = function()
	thirdRonpaButton:SetAlpha(255)
end

local sdraButton = vgui.Create("DImageButton", chrSelector)
sdraButton:SetPos(ScrW()/11.2, ScrH()/1.35)
sdraButton:SetSize(ScrW()/4.4, ScrH()/8)
sdraButton:SetImage( "Selector/SDRA.png" )
sdraButton.OnCursorEntered = function()
    surface.PlaySound("charactermenu/Pick.mp3")
	sdraButton:SetAlpha(200)
end
sdraButton.OnCursorExited = function()
	sdraButton:SetAlpha(255)
end

local rebirthButton = vgui.Create("DImageButton", chrSelector)
rebirthButton:SetPos(ScrW()/3.08, ScrH()/3.2)
rebirthButton:SetSize(ScrW()/4.4, ScrH()/8)
rebirthButton:SetImage( "Selector/Rebirth.png" )
rebirthButton.OnCursorEntered = function() 
    surface.PlaySound("charactermenu/Pick.mp3")
	rebirthButton:SetAlpha(200)
end
rebirthButton.OnCursorExited = function()
	rebirthButton:SetAlpha(255)
end

local otherCharacterButton = vgui.Create("DImageButton", chrSelector)
otherCharacterButton:SetPos(ScrW()/3.08, ScrH()/2.2)
otherCharacterButton:SetSize(ScrW()/4.4, ScrH()/8)
otherCharacterButton:SetImage( "Selector/OtherCharacter.png" )
otherCharacterButton.OnCursorEntered = function()
    surface.PlaySound("charactermenu/Pick.mp3")
	otherCharacterButton:SetAlpha(200)
end
otherCharacterButton.OnCursorExited = function()
	otherCharacterButton:SetAlpha(255)
end

local fButton = vgui.Create("DImageButton", chrSelector)
fButton:SetPos(ScrW()/3.08, ScrH()/1.675)
fButton:SetSize(ScrW()/4.4, ScrH()/8)
fButton:SetImage( "Selector/shattered.png" )
fButton.OnCursorEntered = function()
    surface.PlaySound("charactermenu/Pick.mp3")
	fButton:SetAlpha(200)
end
fButton.OnCursorExited = function()
	fButton:SetAlpha(255)
end

            --Пихать сюда!!!

firstRonpaButton.DoClick = function() surface.PlaySound("charactermenu/Chose.mp3")
    surface.PlaySound("charactermenu/Chose.mp3")
	backImage:SetImage("Selector/THHSelector1.png")
	welcomeImage:SetVisible(false)
	despairImage:SetVisible(false)
	monokumaButton:SetVisible(false)
	listDanganronpaImage:SetVisible(false)
	firstRonpaButton:SetVisible(false)
	secondRonpaButton:SetVisible(false)
	thirdRonpaButton:SetVisible(false)
	sdraButton:SetVisible(false)
	rebirthButton:SetVisible(false)
	otherCharacterButton:SetVisible(false)
	fButton:SetVisible(false)


local MakotoButton = vgui.Create("DImageButton", chrSelector)
CharButton(MakotoButton,3200,13.6,5.74,1.17,"Макото","Makoto",chrSelector,true)

local ByakuyaButton = vgui.Create("DImageButton", chrSelector)
CharButton(ByakuyaButton,5.3,13.6,5.25,1.17,"Бьякуя Тогами","Byakuya",chrSelector,true)

local CelestiaButton = vgui.Create("DImageButton", chrSelector)
CharButton(CelestiaButton,2.55,13.6,5.4,1.17,"Селестия Люденберг","Celestia",chrSelector,true)

local SayakaButton = vgui.Create("DImageButton", chrSelector)
CharButton(SayakaButton,1.688,13.6,5.14,1.17,"Саяка Майзоно","Sayaka",chrSelector,true)

local TokoButton = vgui.Create("DImageButton", chrSelector)
CharButton(TokoButton,1.248,13.6,5,1.17,"Токо Фукава","Toko",chrSelector,true)

local LeonButton = vgui.Create("DImageButton", chrSelector)
CharButton(LeonButton,3200,13.6,5.74,1.17,"Леон Кувата","Leon",chrSelector,false)

local KiyotakaButton = vgui.Create("DImageButton", chrSelector)
CharButton(KiyotakaButton,5.3,13.6,5.25,1.17,"Киётака Ишимару","Kiyotaka",chrSelector,false)

local MondoButton = vgui.Create("DImageButton", chrSelector)
CharButton(MondoButton,2.55,13.6,5.4,1.17,"Мондо Овада","Mondo",chrSelector,false)

local KyokoButton = vgui.Create("DImageButton", chrSelector)
CharButton(KyokoButton,1.688,13.6,5.14,1.17,"Кёко","Kyoko",chrSelector,false)

local MukuroButton = vgui.Create("DImageButton", chrSelector)
CharButton(MukuroButton,1.248,13.6,5,1.17,"Мукуро Икусаба","Mukuro",chrSelector,false)

local HifumiButton = vgui.Create("DImageButton", chrSelector)
CharButton(HifumiButton,2000,13.6,6.7,1.17,"Хифуми Ямада","Hifumi",chrSelector,false)

local YasuhiroButton = vgui.Create("DImageButton", chrSelector)
CharButton(YasuhiroButton,6.2,13.6,6.2,1.17,"Ясухиро Хагакуре","Yasuhiro",chrSelector,false)

local AoiButton = vgui.Create("DImageButton", chrSelector)
CharButton(AoiButton,2.98,13.6,6.35,1.17,"Аой Асахина","Aoi",chrSelector,false)

local ChihiroButton = vgui.Create("DImageButton", chrSelector)
CharButton(ChihiroButton,1.98,13.6,6,1.17,"Чихиро Фуджисаки","Chihiro",chrSelector,false)

local SakuraButton = vgui.Create("DImageButton", chrSelector)
CharButton(SakuraButton,1.462,13.6,6.2,1.17,"Сакура Огами","Sakura",chrSelector,false)

local JunkoButton = vgui.Create("DImageButton", chrSelector)
CharButton(JunkoButton,1.167,13.6,6,1.17,"Джунко Эношима","Junko",chrSelector,false)

local ReturnButton = vgui.Create("DImageButton", chrSelector)
	ReturnButton:SetPos(ScrW()/1.4, ScrH()/200)
	ReturnButton:SetSize(ScrW()/6, ScrH()/22)
	ReturnButton:SetImage( "Selector/ReturnMenu1.png" )
ReturnButton.OnCursorEntered = function()  surface.PlaySound("charactermenu/Pick.mp3")
	ReturnButton:SetAlpha(200)
end
ReturnButton.OnCursorExited = function()
	ReturnButton:SetAlpha(255)
end

local FurtherButton = vgui.Create("DImageButton", chrSelector)
	FurtherButton:SetPos(ScrW()/1.13, ScrH()/1.05)
	FurtherButton:SetSize(ScrW()/10, ScrH()/22)
	FurtherButton:SetImage( "Selector/FurtherButton.png" )
FurtherButton.OnCursorEntered = function()  surface.PlaySound("charactermenu/Pick.mp3")
	FurtherButton:SetAlpha(200)
end
FurtherButton.OnCursorExited = function()
	FurtherButton:SetAlpha(255)
end

local BackButton = vgui.Create("DImageButton", chrSelector)
	BackButton:SetPos(ScrW()/3.35, ScrH()/1.05)
	BackButton:SetSize(ScrW()/10, ScrH()/22)
	BackButton:SetImage( "Selector/BackButton.png" )
	BackButton:SetVisible(false)
BackButton.OnCursorEntered = function()  surface.PlaySound("charactermenu/Pick.mp3")
	BackButton:SetAlpha(200)
end
BackButton.OnCursorExited = function()
	BackButton:SetAlpha(255)
end

BackButton.DoClick = function() surface.PlaySound("charactermenu/Chose.mp3")
	if page == 1 then
	page=page-1
	BackButton:SetVisible(true)
	MakotoButton:SetVisible(true)
	ByakuyaButton:SetVisible(true)
	CelestiaButton:SetVisible(true)
	SayakaButton:SetVisible(true)
	TokoButton:SetVisible(true)
	LeonButton:SetVisible(false)
	KiyotakaButton:SetVisible(false)
	MondoButton:SetVisible(false)
	KyokoButton:SetVisible(false)
	MukuroButton:SetVisible(false)
	BackButton:SetVisible(false)
	end
	if page == 2 then
	page=page-1
	FurtherButton:SetVisible(true)
	LeonButton:SetVisible(true)
	KiyotakaButton:SetVisible(true)
	MondoButton:SetVisible(true)
	KyokoButton:SetVisible(true)
	MukuroButton:SetVisible(true)
	HifumiButton:SetVisible(false)
	YasuhiroButton:SetVisible(false)
	AoiButton:SetVisible(false)
	ChihiroButton:SetVisible(false)
	SakuraButton:SetVisible(false)
	JunkoButton:SetVisible(false)
	backImage:SetImage("Selector/THHSelector1.png")
	FurtherButton:SetVisible(true)
	end
end

FurtherButton.DoClick = function() surface.PlaySound("charactermenu/Chose.mp3")
	if page == 1 then
	page=page+1
	LeonButton:SetVisible(false)
	KiyotakaButton:SetVisible(false)
	MondoButton:SetVisible(false)
	KyokoButton:SetVisible(false)
	MukuroButton:SetVisible(false)
	HifumiButton:SetVisible(true)
	YasuhiroButton:SetVisible(true)
	AoiButton:SetVisible(true)
	ChihiroButton:SetVisible(true)
	SakuraButton:SetVisible(true)
	JunkoButton:SetVisible(true)
	backImage:SetImage("Selector/THHSelector2.png")
	FurtherButton:SetVisible(false)
	end
	if page == 0 then
	page=page+1
	BackButton:SetVisible(true)
	MakotoButton:SetVisible(false)
	ByakuyaButton:SetVisible(false)
	CelestiaButton:SetVisible(false)
	SayakaButton:SetVisible(false)
	TokoButton:SetVisible(false)
	LeonButton:SetVisible(true)
	KiyotakaButton:SetVisible(true)
	MondoButton:SetVisible(true)
	KyokoButton:SetVisible(true)
	MukuroButton:SetVisible(true)
	end
end

ReturnButton.DoClick = function() surface.PlaySound("charactermenu/Chose.mp3")
	backImage:SetImage("Selector/HomeScreen.png")
	welcomeImage:SetVisible(true)
	despairImage:SetVisible(true)
	monokumaButton:SetVisible(true)
	listDanganronpaImage:SetVisible(true)
	firstRonpaButton:SetVisible(true)
	secondRonpaButton:SetVisible(true)
	thirdRonpaButton:SetVisible(true)
	sdraButton:SetVisible(true)
	rebirthButton:SetVisible(true)
	otherCharacterButton:SetVisible(true)
	fButton:SetVisible(true)
	page =0
	BackButton:Remove()
	FurtherButton:Remove()
	MakotoButton:Remove()
	ByakuyaButton:Remove()
	CelestiaButton:Remove()
	SayakaButton:Remove()
	TokoButton:Remove()
	LeonButton:Remove()
	KiyotakaButton:Remove()
	MondoButton:Remove()
	KyokoButton:Remove()
	MukuroButton:Remove()
	HifumiButton:Remove()
	YasuhiroButton:Remove()
	AoiButton:Remove()
	ChihiroButton:Remove()
	SakuraButton:Remove()
	JunkoButton:Remove()
	ReturnButton:Remove()
end
end

secondRonpaButton.DoClick = function() surface.PlaySound("charactermenu/Chose.mp3")
	backImage:SetImage("Selector/GDSelector1.png")
	welcomeImage:SetVisible(false)
	despairImage:SetVisible(false)
	monokumaButton:SetVisible(false)
	listDanganronpaImage:SetVisible(false)
	firstRonpaButton:SetVisible(false)
	secondRonpaButton:SetVisible(false)
	thirdRonpaButton:SetVisible(false)
	sdraButton:SetVisible(false)
	rebirthButton:SetVisible(false)
	otherCharacterButton:SetVisible(false)
	fButton:SetVisible(false)
	
local ImposterButton = vgui.Create("DImageButton", chrSelector)
CharButton(ImposterButton,2000,13.6,6.7,1.17,"Импостер","Imposter",chrSelector,true)

local MahiruButton = vgui.Create("DImageButton", chrSelector)
CharButton(MahiruButton,6.2,13.6,6.2,1.17,"Махиру Коидзуми","Mahiru",chrSelector,true)

local IbukiButton = vgui.Create("DImageButton", chrSelector)
CharButton(IbukiButton,2.98,13.6,6.35,1.17,"Ибуки Миода","Ibuki",chrSelector,true)

local HiyokoButton = vgui.Create("DImageButton", chrSelector)
CharButton(HiyokoButton,1.98,13.6,6,1.17,"Хиёко Сайонджи","Hiyoko",chrSelector,true)

local NekomaruButton = vgui.Create("DImageButton", chrSelector)
CharButton(NekomaruButton,1.462,13.6,6.2,1.17,"Некомару Нидай","Nekomaru",chrSelector,true)

local NagitoButton = vgui.Create("DImageButton", chrSelector)
CharButton(NagitoButton,1.167,13.6,6,1.17,"Нагито","Nagito",chrSelector,true)

local TeruteruButton = vgui.Create("DImageButton", chrSelector)
CharButton(TeruteruButton,3200,13.6,5.74,1.17,"Терутеру Ханамура","Teruteru",chrSelector,false)

local PekoButton = vgui.Create("DImageButton", chrSelector)
CharButton(PekoButton,5.3,13.6,5.25,1.17,"Пеко Пекояма","Peko",chrSelector,false)

local MikanButton = vgui.Create("DImageButton", chrSelector)
CharButton(MikanButton,2.55,13.6,5.4,1.17,"Микан Цумики","Mikan",chrSelector,false)

local GundhamButton = vgui.Create("DImageButton", chrSelector)
CharButton(GundhamButton,1.688,13.6,5.14,1.17,"Гандам Танака","Gundham",chrSelector,false)

local ChiakiButton = vgui.Create("DImageButton", chrSelector)
CharButton(ChiakiButton,1.248,13.6,5,1.17,"Чиаки Нанами","Chiaki",chrSelector,false)

local HajimeButton = vgui.Create("DImageButton", chrSelector)
CharButton(HajimeButton,3200,13.6,5.74,1.17,"Хаджиме Хината","Hajime",chrSelector,false)

local AkaneButton = vgui.Create("DImageButton", chrSelector)
CharButton(AkaneButton,5.3,13.6,5.25,1.17,"Аканэ Овари","Akane",chrSelector,false)

local FuyuhikoButton = vgui.Create("DImageButton", chrSelector)
CharButton(FuyuhikoButton,2.55,13.6,5.4,1.17,"Фуюхико Кузурю","Fuyuhiko",chrSelector,false)

local KazuichiButton = vgui.Create("DImageButton", chrSelector)
CharButton(KazuichiButton,1.688,13.6,5.14,1.17,"Казуичи Сода","Kazuichi",chrSelector,false)

local SoniaButton = vgui.Create("DImageButton", chrSelector)
CharButton(SoniaButton,1.248,13.6,5,1.17,"Сония Невермайнд","Sonia",chrSelector,false)

local ReturnButton = vgui.Create("DImageButton", chrSelector)
	ReturnButton:SetPos(ScrW()/1.4, ScrH()/200)
	ReturnButton:SetSize(ScrW()/6, ScrH()/22)
	ReturnButton:SetImage( "Selector/ReturnMenu2.png" )
ReturnButton.OnCursorEntered = function()  surface.PlaySound("charactermenu/Pick.mp3")
	ReturnButton:SetAlpha(200)
end
ReturnButton.OnCursorExited = function()
	ReturnButton:SetAlpha(255)
end

local FurtherButton = vgui.Create("DImageButton", chrSelector)
	FurtherButton:SetPos(ScrW()/1.13, ScrH()/1.05)
	FurtherButton:SetSize(ScrW()/10, ScrH()/22)
	FurtherButton:SetImage( "Selector/FurtherButton2.png" )
FurtherButton.OnCursorEntered = function()  surface.PlaySound("charactermenu/Pick.mp3")
	FurtherButton:SetAlpha(200)
end
FurtherButton.OnCursorExited = function()
	FurtherButton:SetAlpha(255)
end

local BackButton = vgui.Create("DImageButton", chrSelector)
	BackButton:SetPos(ScrW()/3.35, ScrH()/1.05)
	BackButton:SetSize(ScrW()/10, ScrH()/22)
	BackButton:SetImage( "Selector/BackButton2.png" )
	BackButton:SetVisible(false)
BackButton.OnCursorEntered = function()  surface.PlaySound("charactermenu/Pick.mp3")
	BackButton:SetAlpha(200)
end
BackButton.OnCursorExited = function()
	BackButton:SetAlpha(255)
end

BackButton.DoClick = function() surface.PlaySound("charactermenu/Chose.mp3")
	if page == 1 then
	page=page-1
	BackButton:SetVisible(true)
	TeruteruButton:SetVisible(false)
	PekoButton:SetVisible(false)
	MikanButton:SetVisible(false)
	GundhamButton:SetVisible(false)
	ChiakiButton:SetVisible(false)
	ImposterButton:SetVisible(true)
	MahiruButton:SetVisible(true)
	IbukiButton:SetVisible(true)
	HiyokoButton:SetVisible(true)
	NekomaruButton:SetVisible(true)
	NagitoButton:SetVisible(true)
	backImage:SetImage("Selector/GDSelector1.png")
	BackButton:SetVisible(false)
	end
	if page == 2 then
	page=page-1
	FurtherButton:SetVisible(true)
	TeruteruButton:SetVisible(true)
	PekoButton:SetVisible(true)
	MikanButton:SetVisible(true)
	GundhamButton:SetVisible(true)
	ChiakiButton:SetVisible(true)
	HajimeButton:SetVisible(false)
	AkaneButton:SetVisible(false)
	FuyuhikoButton:SetVisible(false)
	KazuichiButton:SetVisible(false)
	SoniaButton:SetVisible(false)
	FurtherButton:SetVisible(true)
	end
end

FurtherButton.DoClick = function() surface.PlaySound("charactermenu/Chose.mp3")
	if page == 1 then
	page=page+1
	TeruteruButton:SetVisible(false)
	PekoButton:SetVisible(false)
	MikanButton:SetVisible(false)
	GundhamButton:SetVisible(false)
	ChiakiButton:SetVisible(false)
	HajimeButton:SetVisible(true)
	AkaneButton:SetVisible(true)
	FuyuhikoButton:SetVisible(true)
	KazuichiButton:SetVisible(true)
	SoniaButton:SetVisible(true)
	FurtherButton:SetVisible(false)
	end
	if page == 0 then
	page=page+1
	BackButton:SetVisible(true)
	ImposterButton:SetVisible(false)
	MahiruButton:SetVisible(false)
	IbukiButton:SetVisible(false)
	HiyokoButton:SetVisible(false)
	NekomaruButton:SetVisible(false)
	NagitoButton:SetVisible(false)
	TeruteruButton:SetVisible(true)
	PekoButton:SetVisible(true)
	MikanButton:SetVisible(true)
	GundhamButton:SetVisible(true)
	ChiakiButton:SetVisible(true)
	backImage:SetImage("Selector/GDSelector2.png")
	end
end

ReturnButton.DoClick = function() surface.PlaySound("charactermenu/Chose.mp3")
	backImage:SetImage("Selector/HomeScreen.png")
	welcomeImage:SetVisible(true)
	despairImage:SetVisible(true)
	monokumaButton:SetVisible(true)
	listDanganronpaImage:SetVisible(true)
	firstRonpaButton:SetVisible(true)
	secondRonpaButton:SetVisible(true)
	thirdRonpaButton:SetVisible(true)
	sdraButton:SetVisible(true)
	rebirthButton:SetVisible(true)
	otherCharacterButton:SetVisible(true)
	fButton:SetVisible(true)
	page =0
	BackButton:Remove()
	FurtherButton:Remove()
	ImposterButton:Remove()
	MahiruButton:Remove()
	IbukiButton:Remove()
	HiyokoButton:Remove()
	NekomaruButton:Remove()
	NagitoButton:Remove()
	TeruteruButton:Remove()
	PekoButton:Remove()
	MikanButton:Remove()
	GundhamButton:Remove()
	ChiakiButton:Remove()
	HajimeButton:Remove()
	AkaneButton:Remove()
	FuyuhikoButton:Remove()
	KazuichiButton:Remove()
	SoniaButton:Remove()
	ReturnButton:Remove()
end
end

thirdRonpaButton.DoClick = function() surface.PlaySound("charactermenu/Chose.mp3")
	backImage:SetImage("Selector/V3Selector1.png")
	welcomeImage:SetVisible(false)
	despairImage:SetVisible(false)
	monokumaButton:SetVisible(false)
	listDanganronpaImage:SetVisible(false)
	firstRonpaButton:SetVisible(false)
	secondRonpaButton:SetVisible(false)
	thirdRonpaButton:SetVisible(false)
	sdraButton:SetVisible(false)
	rebirthButton:SetVisible(false)
	otherCharacterButton:SetVisible(false)
	fButton:SetVisible(false)
	
local RantaroButton = vgui.Create("DImageButton", chrSelector)
CharButton(RantaroButton,2000,13.6,6.7,1.17,"Рантаро","Rantaro",chrSelector,true)

local RyomaButton = vgui.Create("DImageButton", chrSelector)
CharButton(RyomaButton,6.2,13.6,6.2,1.17,"Рёма Хоши","Ryoma",chrSelector,true)

local AngieButton = vgui.Create("DImageButton", chrSelector)
CharButton(AngieButton,2.98,13.6,6.35,1.17,"Анджи Йонага","Angie",chrSelector,true)

local TenkoButton = vgui.Create("DImageButton", chrSelector)
CharButton(TenkoButton,1.98,13.6,6,1.17,"Тенко Чабашира","Tenko",chrSelector,true)

local MiuButton = vgui.Create("DImageButton", chrSelector)
CharButton(MiuButton,1.462,13.6,6.2,1.17,"Миу Ирума","Miu",chrSelector,true)

local KokichiButton = vgui.Create("DImageButton", chrSelector)
CharButton(KokichiButton,1.167,13.6,6,1.17,"Кокичи Ома","Kokichi",chrSelector,true)

local KaitoButton = vgui.Create("DImageButton", chrSelector)
CharButton(KaitoButton,3200,13.6,5.74,1.17,"Кайто Момота","Kaito",chrSelector,false)

local GontaButton = vgui.Create("DImageButton", chrSelector)
CharButton(GontaButton,5.3,13.6,5.25,1.17,"Гонта Гокухара","Gonta",chrSelector,false)

local KorekiyoButton = vgui.Create("DImageButton", chrSelector)
CharButton(KorekiyoButton,2.55,13.6,5.4,1.17,"Корекиё Шингуджи","Korekiyo",chrSelector,false)

local KirumiButton = vgui.Create("DImageButton", chrSelector)
CharButton(KirumiButton,1.688,13.6,5.14,1.17,"Кируми Тоджо","Kirumi",chrSelector,false)

local KaedeButton = vgui.Create("DImageButton", chrSelector)
CharButton(KaedeButton,1.248,13.6,5,1.17,"Каедэ Акаматсу","Kaede",chrSelector,false)

local ShuichiButton = vgui.Create("DImageButton", chrSelector)
CharButton(ShuichiButton,3200,13.6,5.74,1.17,"Шуичи","Shuichi",chrSelector,false)

local MakiButton = vgui.Create("DImageButton", chrSelector)
CharButton(MakiButton,5.3,13.6,5.25,1.17,"Маки Харукава","Maki",chrSelector,false)

local HimikoButton = vgui.Create("DImageButton", chrSelector)
CharButton(HimikoButton,2.55,13.6,5.4,1.17,"Химико Юмено","Himiko",chrSelector,false)

local K1B0Button = vgui.Create("DImageButton", chrSelector)
CharButton(K1B0Button,1.688,13.6,5.14,1.17,"K1-B0","K1B0",chrSelector,false)

local TsumugiButton = vgui.Create("DImageButton", chrSelector)
CharButton(TsumugiButton,1.248,13.6,5,1.17,"Цумуги Широгане","Tsumugi",chrSelector,false)

local ReturnButton = vgui.Create("DImageButton", chrSelector)
	ReturnButton:SetPos(ScrW()/1.4, ScrH()/200)
	ReturnButton:SetSize(ScrW()/6, ScrH()/22)
	ReturnButton:SetImage( "Selector/ReturnMenu3.png" )
ReturnButton.OnCursorEntered = function()  surface.PlaySound("charactermenu/Pick.mp3")
	ReturnButton:SetAlpha(200)
end
ReturnButton.OnCursorExited = function()
	ReturnButton:SetAlpha(255)
end

local FurtherButton = vgui.Create("DImageButton", chrSelector)
	FurtherButton:SetPos(ScrW()/1.13, ScrH()/1.05)
	FurtherButton:SetSize(ScrW()/10, ScrH()/22)
	FurtherButton:SetImage( "Selector/FurtherButton3.png" )
FurtherButton.OnCursorEntered = function()  surface.PlaySound("charactermenu/Pick.mp3")
	FurtherButton:SetAlpha(200)
end
FurtherButton.OnCursorExited = function()
	FurtherButton:SetAlpha(255)
end

local BackButton = vgui.Create("DImageButton", chrSelector)
	BackButton:SetPos(ScrW()/3.35, ScrH()/1.05)
	BackButton:SetSize(ScrW()/10, ScrH()/22)
	BackButton:SetImage( "Selector/BackButton3.png" )
	BackButton:SetVisible(false)
BackButton.OnCursorEntered = function()  surface.PlaySound("charactermenu/Pick.mp3")
	BackButton:SetAlpha(200)
end
BackButton.OnCursorExited = function()
	BackButton:SetAlpha(255)
end

BackButton.DoClick = function() surface.PlaySound("charactermenu/Chose.mp3")
	if page == 1 then
	page=page-1
	BackButton:SetVisible(true)
	KaitoButton:SetVisible(false)
	GontaButton:SetVisible(false)
	KorekiyoButton:SetVisible(false)
	KirumiButton:SetVisible(false)
	KaedeButton:SetVisible(false)
	RantaroButton:SetVisible(true)
	RyomaButton:SetVisible(true)
	AngieButton:SetVisible(true)
	TenkoButton:SetVisible(true)
	MiuButton:SetVisible(true)
	KokichiButton:SetVisible(true)
	backImage:SetImage("Selector/V3Selector1.png")
	BackButton:SetVisible(false)
	end
	if page == 2 then
	page=page-1
	FurtherButton:SetVisible(true)
	KaitoButton:SetVisible(true)
	GontaButton:SetVisible(true)
	KorekiyoButton:SetVisible(true)
	KirumiButton:SetVisible(true)
	KaedeButton:SetVisible(true)
	ShuichiButton:SetVisible(false)
	MakiButton:SetVisible(false)
	HimikoButton:SetVisible(false)
	K1B0Button:SetVisible(false)
	TsumugiButton:SetVisible(false)
	FurtherButton:SetVisible(true)
	end
end

FurtherButton.DoClick = function() surface.PlaySound("charactermenu/Chose.mp3")
	if page == 1 then
	page=page+1
	KaitoButton:SetVisible(false)
	GontaButton:SetVisible(false)
	KorekiyoButton:SetVisible(false)
	KirumiButton:SetVisible(false)
	KaedeButton:SetVisible(false)
	ShuichiButton:SetVisible(true)
	MakiButton:SetVisible(true)
	HimikoButton:SetVisible(true)
	K1B0Button:SetVisible(true)
	TsumugiButton:SetVisible(true)
	FurtherButton:SetVisible(false)
	end
	if page == 0 then
	page=page+1
	BackButton:SetVisible(true)
	RantaroButton:SetVisible(false)
	RyomaButton:SetVisible(false)
	AngieButton:SetVisible(false)
	TenkoButton:SetVisible(false)
	MiuButton:SetVisible(false)
	KokichiButton:SetVisible(false)
	KaitoButton:SetVisible(true)
	GontaButton:SetVisible(true)
	KorekiyoButton:SetVisible(true)
	KirumiButton:SetVisible(true)
	KaedeButton:SetVisible(true)
	backImage:SetImage("Selector/V3Selector2.png")
	end
end

ReturnButton.DoClick = function() surface.PlaySound("charactermenu/Chose.mp3")
	backImage:SetImage("Selector/HomeScreen.png")
	welcomeImage:SetVisible(true)
	despairImage:SetVisible(true)
	monokumaButton:SetVisible(true)
	listDanganronpaImage:SetVisible(true)
	firstRonpaButton:SetVisible(true)
	secondRonpaButton:SetVisible(true)
	thirdRonpaButton:SetVisible(true)
	sdraButton:SetVisible(true)
	rebirthButton:SetVisible(true)
	otherCharacterButton:SetVisible(true)
	fButton:SetVisible(true)
	page =0
	BackButton:Remove()
	FurtherButton:Remove()
	RantaroButton:Remove()
	RyomaButton:Remove()
	AngieButton:Remove()
	TenkoButton:Remove()
	MiuButton:Remove()
	KokichiButton:Remove()
	KaitoButton:Remove()
	GontaButton:Remove()
	KorekiyoButton:Remove()
	KirumiButton:Remove()
	KaedeButton:Remove()
	ShuichiButton:Remove()
	MakiButton:Remove()
	HimikoButton:Remove()
	K1B0Button:Remove()
	TsumugiButton:Remove()
	ReturnButton:Remove()
end
end

sdraButton.DoClick = function() surface.PlaySound("charactermenu/Chose.mp3")
	backImage:SetImage("Selector/SDRASelector1.png")
	welcomeImage:SetVisible(false)
	despairImage:SetVisible(false)
	monokumaButton:SetVisible(false)
	listDanganronpaImage:SetVisible(false)
	firstRonpaButton:SetVisible(false)
	secondRonpaButton:SetVisible(false)
	thirdRonpaButton:SetVisible(false)
	sdraButton:SetVisible(false)
	rebirthButton:SetVisible(false)
	otherCharacterButton:SetVisible(false)
	fButton:SetVisible(false)
	
local MikadoButton = vgui.Create("DImageButton", chrSelector)
CharButton(MikadoButton,3200,13.6,5.74,1.17,"Микадо Санноджи","Mikado",chrSelector,true)

local SoraButton = vgui.Create("DImageButton", chrSelector)
CharButton(SoraButton,5.3,13.6,5.25,1.17,"Сора","Sora",chrSelector,true)

local YuriButton = vgui.Create("DImageButton", chrSelector)
CharButton(YuriButton,2.55,13.6,5.4,1.17,"Юри Кагарин","Yuri",chrSelector,true)

local KokoroButton = vgui.Create("DImageButton", chrSelector)
CharButton(KokoroButton,1.688,13.6,5.14,1.17,"Кокоро Митсуме","Kokoro",chrSelector,true)

local NikeiButton = vgui.Create("DImageButton", chrSelector)
CharButton(NikeiButton,1.248,13.6,5,1.17,"Никей","Nikei",chrSelector,true)

local TeruyaButton = vgui.Create("DImageButton", chrSelector)
CharButton(TeruyaButton,3200,13.6,5.74,1.17,"Теруя Отори","Teruya",chrSelector,false)

local HibikiButton = vgui.Create("DImageButton", chrSelector)
CharButton(HibikiButton,5.3,13.6,5.25,1.17,"Хибики Отонокоджи","Hibiki",chrSelector,false)

local KanadeButton = vgui.Create("DImageButton", chrSelector)
CharButton(KanadeButton,2.55,13.6,5.4,1.17,"Канаде Отонокоджи","Kanade",chrSelector,false)

local SetsukaButton = vgui.Create("DImageButton", chrSelector)
CharButton(SetsukaButton,1.688,13.6,5.14,1.17,"Сетсука Чибукуро","Setsuka",chrSelector,false)

local EmmaButton = vgui.Create("DImageButton", chrSelector)
CharButton(EmmaButton,1.248,13.6,5,1.17,"Эмма Магороби","Emma",chrSelector,false)

local ShobaiButton = vgui.Create("DImageButton", chrSelector)
CharButton(ShobaiButton,2000,13.6,6.7,1.17,"Шобай","Shobai",chrSelector,false)

local IrohaButton = vgui.Create("DImageButton", chrSelector)
CharButton(IrohaButton,6.2,13.6,6.2,1.17,"Ироха Ниджиуэ","Iroha",chrSelector,false)

local MakunouchiButton = vgui.Create("DImageButton", chrSelector)
CharButton(MakunouchiButton,2.98,13.6,6.35,1.17,"Хаджиме Макуноучи","Makunouchi",chrSelector,false)

local ShinjiButton = vgui.Create("DImageButton", chrSelector)
CharButton(ShinjiButton,1.98,13.6,6,1.17,"Шинджи Касай","Shinji",chrSelector,false)

local YorukoButton = vgui.Create("DImageButton", chrSelector)
CharButton(YorukoButton,1.462,13.6,6.2,1.17,"Йоруко Кабуя","Yoruko",chrSelector,false)

local YukiButton = vgui.Create("DImageButton", chrSelector)
CharButton(YukiButton,1.167,13.6,6,1.17,"Юки","Yuki",chrSelector,false)

local ReturnButton = vgui.Create("DImageButton", chrSelector)
	ReturnButton:SetPos(ScrW()/1.4, ScrH()/200)
	ReturnButton:SetSize(ScrW()/6, ScrH()/22)
	ReturnButton:SetImage( "Selector/ReturnMenu4.png" )
ReturnButton.OnCursorEntered = function()  surface.PlaySound("charactermenu/Pick.mp3")
	ReturnButton:SetAlpha(200)
end
ReturnButton.OnCursorExited = function()
	ReturnButton:SetAlpha(255)
end

local FurtherButton = vgui.Create("DImageButton", chrSelector)
	FurtherButton:SetPos(ScrW()/1.13, ScrH()/1.05)
	FurtherButton:SetSize(ScrW()/10, ScrH()/22)
	FurtherButton:SetImage( "Selector/FurtherButton4.png" )
FurtherButton.OnCursorEntered = function()  surface.PlaySound("charactermenu/Pick.mp3")
	FurtherButton:SetAlpha(200)
end
FurtherButton.OnCursorExited = function()
	FurtherButton:SetAlpha(255)
end

local BackButton = vgui.Create("DImageButton", chrSelector)
	BackButton:SetPos(ScrW()/3.35, ScrH()/1.05)
	BackButton:SetSize(ScrW()/10, ScrH()/22)
	BackButton:SetImage( "Selector/BackButton4.png" )
	BackButton:SetVisible(false)
BackButton.OnCursorEntered = function()  surface.PlaySound("charactermenu/Pick.mp3")
	BackButton:SetAlpha(200)
end
BackButton.OnCursorExited = function()
	BackButton:SetAlpha(255)
end

BackButton.DoClick = function() surface.PlaySound("charactermenu/Chose.mp3")
	if page == 1 then
	page=page-1
	BackButton:SetVisible(true)
	MikadoButton:SetVisible(true)
	SoraButton:SetVisible(true)
	YuriButton:SetVisible(true)
	KokoroButton:SetVisible(true)
	NikeiButton:SetVisible(true)
	TeruyaButton:SetVisible(false)
	HibikiButton:SetVisible(false)
	KanadeButton:SetVisible(false)
	SetsukaButton:SetVisible(false)
	EmmaButton:SetVisible(false)
	BackButton:SetVisible(false)
	end
	if page == 2 then
	page=page-1
	FurtherButton:SetVisible(true)
	TeruyaButton:SetVisible(true)
	HibikiButton:SetVisible(true)
	KanadeButton:SetVisible(true)
	SetsukaButton:SetVisible(true)
	EmmaButton:SetVisible(true)
	ShobaiButton:SetVisible(false)
	IrohaButton:SetVisible(false)
	MakunouchiButton:SetVisible(false)
	ShinjiButton:SetVisible(false)
	YorukoButton:SetVisible(false)
	YukiButton:SetVisible(false)
	backImage:SetImage("Selector/SDRASelector1.png")
	FurtherButton:SetVisible(true)
	end
end

FurtherButton.DoClick = function() surface.PlaySound("charactermenu/Chose.mp3")
	if page == 1 then
	page=page+1
	TeruyaButton:SetVisible(false)
	HibikiButton:SetVisible(false)
	KanadeButton:SetVisible(false)
	SetsukaButton:SetVisible(false)
	EmmaButton:SetVisible(false)
	ShobaiButton:SetVisible(true)
	IrohaButton:SetVisible(true)
	MakunouchiButton:SetVisible(true)
	ShinjiButton:SetVisible(true)
	YorukoButton:SetVisible(true)
	YukiButton:SetVisible(true)
	backImage:SetImage("Selector/SDRASelector2.png")
	FurtherButton:SetVisible(false)
	end
	if page == 0 then
	page=page+1
	BackButton:SetVisible(true)
	MikadoButton:SetVisible(false)
	SoraButton:SetVisible(false)
	YuriButton:SetVisible(false)
	KokoroButton:SetVisible(false)
	NikeiButton:SetVisible(false)
	TeruyaButton:SetVisible(true)
	HibikiButton:SetVisible(true)
	KanadeButton:SetVisible(true)
	SetsukaButton:SetVisible(true)
	EmmaButton:SetVisible(true)
	end
end

ReturnButton.DoClick = function() surface.PlaySound("charactermenu/Chose.mp3")
	backImage:SetImage("Selector/HomeScreen.png")
	welcomeImage:SetVisible(true)
	despairImage:SetVisible(true)
	monokumaButton:SetVisible(true)
	listDanganronpaImage:SetVisible(true)
	firstRonpaButton:SetVisible(true)
	secondRonpaButton:SetVisible(true)
	thirdRonpaButton:SetVisible(true)
	sdraButton:SetVisible(true)
	rebirthButton:SetVisible(true)
	otherCharacterButton:SetVisible(true)
	fButton:SetVisible(true)
	page =0
	BackButton:Remove()
	FurtherButton:Remove()
	MikadoButton:Remove()
	SoraButton:Remove()
	YuriButton:Remove()
	KokoroButton:Remove()
	NikeiButton:Remove()
	TeruyaButton:Remove()
	HibikiButton:Remove()
	KanadeButton:Remove()
	SetsukaButton:Remove()
	EmmaButton:Remove()
	ShobaiButton:Remove()
	IrohaButton:Remove()
	MakunouchiButton:Remove()
	ShinjiButton:Remove()
	YorukoButton:Remove()
	YukiButton:Remove()
	ReturnButton:Remove()
end
end

rebirthButton.DoClick = function() surface.PlaySound("charactermenu/Chose.mp3")
	backImage:SetImage("Selector/RebirthSelector.png")
	welcomeImage:SetVisible(false)
	despairImage:SetVisible(false)
	monokumaButton:SetVisible(false)
	listDanganronpaImage:SetVisible(false)
	firstRonpaButton:SetVisible(false)
	secondRonpaButton:SetVisible(false)
	thirdRonpaButton:SetVisible(false)
	sdraButton:SetVisible(false)
	rebirthButton:SetVisible(false)
	otherCharacterButton:SetVisible(false)
	fButton:SetVisible(false)
	
local NicoButton = vgui.Create("DImageButton", chrSelector)
CharButton(NicoButton,3200,13.6,5.74,1.17,"Нико","Nico",chrSelector,true)

local AkiraButton = vgui.Create("DImageButton", chrSelector)
CharButton(AkiraButton,5.3,13.6,5.25,1.17,"Акира Цучия","Akira",chrSelector,true)

local SaijiButton = vgui.Create("DImageButton", chrSelector)
CharButton(SaijiButton,2.55,13.6,5.4,1.17,"Сайджи Рокудо","Saiji",chrSelector,true)

local MarinButton = vgui.Create("DImageButton", chrSelector)
CharButton(MarinButton,1.688,13.6,5.14,1.17,"Марин Мизута","Marin",chrSelector,true)

local MikotoButton = vgui.Create("DImageButton", chrSelector)
CharButton(MikotoButton,1.248,13.6,5,1.17,"Микото","Mikoto",chrSelector,true)

local MaikoButton = vgui.Create("DImageButton", chrSelector)
CharButton(MaikoButton,3200,13.6,5.74,1.17,"Майко Кагура","Maiko",chrSelector,false)

local MisuzuButton = vgui.Create("DImageButton", chrSelector)
CharButton(MisuzuButton,5.3,13.6,5.25,1.17,"Мисузу Айсака","Misuzu",chrSelector,false)

local ArumaButton = vgui.Create("DImageButton", chrSelector)
CharButton(ArumaButton,2.55,13.6,5.4,1.17,"Арума Тодороки","Aruma",chrSelector,false)

local SeishiButton = vgui.Create("DImageButton", chrSelector)
CharButton(SeishiButton,1.688,13.6,5.14,1.17,"Сейши Йодогава","Seishi",chrSelector,false)

local MitsunariButton = vgui.Create("DImageButton", chrSelector)
CharButton(MitsunariButton,1.248,13.6,5,1.17,"Мицунари Кога","Mitsunari",chrSelector,false)

local AyumuButton = vgui.Create("DImageButton", chrSelector)
CharButton(AyumuButton,3200,13.6,5.74,1.17,"Аюму Фуджимори","Ayumu",chrSelector,false)

local KegoButton = vgui.Create("DImageButton", chrSelector)
CharButton(KegoButton,5.3,13.6,5.25,1.17,"Кего Сакума","Kego",chrSelector,false)

local KazuomiButton = vgui.Create("DImageButton", chrSelector)
CharButton(KazuomiButton,2.55,13.6,5.4,1.17,"Казуоми Самеджима","Kazuomi",chrSelector,false)

local KasumiButton = vgui.Create("DImageButton", chrSelector)
CharButton(KasumiButton,1.688,13.6,5.14,1.17,"Касуми Изумо","Kasumi",chrSelector,false)

local NarumiButton = vgui.Create("DImageButton", chrSelector)
CharButton(NarumiButton,1.248,13.6,5,1.17,"Наруми Осоне","Narumi",chrSelector,false)

local ReturnButton = vgui.Create("DImageButton", chrSelector)
	ReturnButton:SetPos(ScrW()/1.4, ScrH()/200)
	ReturnButton:SetSize(ScrW()/6, ScrH()/22)
	ReturnButton:SetImage( "Selector/ReturnMenu5.png" )
ReturnButton.OnCursorEntered = function()  surface.PlaySound("charactermenu/Pick.mp3")
	ReturnButton:SetAlpha(200)
end
ReturnButton.OnCursorExited = function()
	ReturnButton:SetAlpha(255)
end

local FurtherButton = vgui.Create("DImageButton", chrSelector)
	FurtherButton:SetPos(ScrW()/1.13, ScrH()/1.05)
	FurtherButton:SetSize(ScrW()/10, ScrH()/22)
	FurtherButton:SetImage( "Selector/FurtherButton5.png" )
FurtherButton.OnCursorEntered = function()  surface.PlaySound("charactermenu/Pick.mp3")
	FurtherButton:SetAlpha(200)
end
FurtherButton.OnCursorExited = function()
	FurtherButton:SetAlpha(255)
end

local BackButton = vgui.Create("DImageButton", chrSelector)
	BackButton:SetPos(ScrW()/3.35, ScrH()/1.05)
	BackButton:SetSize(ScrW()/10, ScrH()/22)
	BackButton:SetImage( "Selector/BackButton5.png" )
	BackButton:SetVisible(false)
BackButton.OnCursorEntered = function()  surface.PlaySound("charactermenu/Pick.mp3")
	BackButton:SetAlpha(200)
end
BackButton.OnCursorExited = function()
	BackButton:SetAlpha(255)
end

BackButton.DoClick = function() surface.PlaySound("charactermenu/Chose.mp3")
	if page == 1 then
	page=page-1
	BackButton:SetVisible(true)
	NicoButton:SetVisible(true)
	AkiraButton:SetVisible(true)
	SaijiButton:SetVisible(true)
	MarinButton:SetVisible(true)
	MikotoButton:SetVisible(true)
	MaikoButton:SetVisible(false)
	MisuzuButton:SetVisible(false)
	ArumaButton:SetVisible(false)
	SeishiButton:SetVisible(false)
	MitsunariButton:SetVisible(false)
	BackButton:SetVisible(false)
	end
	if page == 2 then
	page=page-1
	FurtherButton:SetVisible(true)
	MaikoButton:SetVisible(true)
	MisuzuButton:SetVisible(true)
	ArumaButton:SetVisible(true)
	SeishiButton:SetVisible(true)
	MitsunariButton:SetVisible(true)
	AyumuButton:SetVisible(false)
	KegoButton:SetVisible(false)
	KazuomiButton:SetVisible(false)
	KasumiButton:SetVisible(false)
	NarumiButton:SetVisible(false)
	FurtherButton:SetVisible(true)
	end
end

FurtherButton.DoClick = function() surface.PlaySound("charactermenu/Chose.mp3")
	if page == 1 then
	page=page+1
	MaikoButton:SetVisible(false)
	MisuzuButton:SetVisible(false)
	ArumaButton:SetVisible(false)
	SeishiButton:SetVisible(false)
	MitsunariButton:SetVisible(false)
	AyumuButton:SetVisible(true)
	KegoButton:SetVisible(true)
	KazuomiButton:SetVisible(true)
	KasumiButton:SetVisible(true)
	NarumiButton:SetVisible(true)
	FurtherButton:SetVisible(false)
	end
	if page == 0 then
	page=page+1
	BackButton:SetVisible(true)
	NicoButton:SetVisible(false)
	AkiraButton:SetVisible(false)
	SaijiButton:SetVisible(false)
	MarinButton:SetVisible(false)
	MikotoButton:SetVisible(false)
	MaikoButton:SetVisible(true)
	MisuzuButton:SetVisible(true)
	ArumaButton:SetVisible(true)
	SeishiButton:SetVisible(true)
	MitsunariButton:SetVisible(true)
	end
end

ReturnButton.DoClick = function() surface.PlaySound("charactermenu/Chose.mp3")
	backImage:SetImage("Selector/HomeScreen.png")
	welcomeImage:SetVisible(true)
	despairImage:SetVisible(true)
	monokumaButton:SetVisible(true)
	listDanganronpaImage:SetVisible(true)
	firstRonpaButton:SetVisible(true)
	secondRonpaButton:SetVisible(true)
	thirdRonpaButton:SetVisible(true)
	sdraButton:SetVisible(true)
	rebirthButton:SetVisible(true)
	otherCharacterButton:SetVisible(true)
	fButton:SetVisible(true)
	page =0
	BackButton:Remove()
	FurtherButton:Remove()
	NicoButton:Remove()
	AkiraButton:Remove()
	SaijiButton:Remove()
	MarinButton:Remove()
	MikotoButton:Remove()
	MaikoButton:Remove()
	MisuzuButton:Remove()
	ArumaButton:Remove()
	SeishiButton:Remove()
	MitsunariButton:Remove()
	AyumuButton:Remove()
	KegoButton:Remove()
	KazuomiButton:Remove()
	KasumiButton:Remove()
	NarumiButton:Remove()
	ReturnButton:Remove()
end
end

fButton.DoClick = function() surface.PlaySound("charactermenu/Chose.mp3")
	backImage:SetImage("Selector/fSelector1.png")
	welcomeImage:SetVisible(false)
	despairImage:SetVisible(false)
	monokumaButton:SetVisible(false)
	listDanganronpaImage:SetVisible(false)
	firstRonpaButton:SetVisible(false)
	secondRonpaButton:SetVisible(false)
	thirdRonpaButton:SetVisible(false)
	sdraButton:SetVisible(false)
	rebirthButton:SetVisible(false)
	otherCharacterButton:SetVisible(false)
	fButton:SetVisible(false)
	
local PocketButton = vgui.Create("DImageButton", chrSelector)
CharButton(PocketButton,3100,13.6,4.92,1.17,"Покет","Pocket",chrSelector,true)

local GrispButton = vgui.Create("DImageButton", chrSelector)
CharButton(GrispButton,4.58,13.6,3.9,1.17,"Грисп","Grisp",chrSelector,true)

local CrossButton = vgui.Create("DImageButton", chrSelector)
CharButton(CrossButton,2.04,13.6,3.735,1.17,"Кросс","Cross",chrSelector,true)

local EnigmaButton = vgui.Create("DImageButton", chrSelector)
CharButton(EnigmaButton,1.293,13.6,4.4,1.17,"Энигма","Enigma",chrSelector,true)

local AnonButton = vgui.Create("DImageButton", chrSelector)
CharButton(AnonButton,3200,13.6,5.74,1.17,"Анон","Anon",chrSelector,false)

local MoraiteruButton = vgui.Create("DImageButton", chrSelector)
CharButton(MoraiteruButton,5.3,13.6,5.25,1.17,"Мораитеру","Moraiteru",chrSelector,false)

local YaxiButton = vgui.Create("DImageButton", chrSelector)
CharButton(YaxiButton,2.55,13.6,5.4,1.17,"Якси","Yaxi",chrSelector,false)

local RockButton = vgui.Create("DImageButton", chrSelector)
CharButton(RockButton,1.688,13.6,5.14,1.17,"Рок","Rock",chrSelector,false)

local RoxButton = vgui.Create("DImageButton", chrSelector)
CharButton(RoxButton,1.248,13.6,5,1.17,"Рокс","Rox",chrSelector,false)

local RissiButton = vgui.Create("DImageButton", chrSelector)
CharButton(RissiButton,3200,13.6,5.74,1.17,"Рисси","Rissi",chrSelector,false)

local ScarletButton = vgui.Create("DImageButton", chrSelector)
CharButton(ScarletButton,5.3,13.6,5.25,1.17,"Скарлет","Scarlet",chrSelector,false)

local TwinButton = vgui.Create("DImageButton", chrSelector)
CharButton(TwinButton,2.55,13.6,5.4,1.17,"Твин","Twin",chrSelector,false)

local CancelButton = vgui.Create("DImageButton", chrSelector)
CharButton(CancelButton,1.688,13.6,5.14,1.17,"Канцел","Cancel",chrSelector,false)

local CorzaButton = vgui.Create("DImageButton", chrSelector)
CharButton(CorzaButton,1.248,13.6,5,1.17,"Корза","Corza",chrSelector,false)

local ReturnButton = vgui.Create("DImageButton", chrSelector)
	ReturnButton:SetPos(ScrW()/1.4, ScrH()/200)
	ReturnButton:SetSize(ScrW()/6, ScrH()/22)
	ReturnButton:SetImage( "Selector/ReturnMenu8.png" )
ReturnButton.OnCursorEntered = function()  surface.PlaySound("charactermenu/Pick.mp3")
	ReturnButton:SetAlpha(200)
end
ReturnButton.OnCursorExited = function()
	ReturnButton:SetAlpha(255)
end

local FurtherButton = vgui.Create("DImageButton", chrSelector)
	FurtherButton:SetPos(ScrW()/1.13, ScrH()/1.05)
	FurtherButton:SetSize(ScrW()/10, ScrH()/22)
	FurtherButton:SetImage( "Selector/FurtherButton6.png" )
FurtherButton.OnCursorEntered = function()  surface.PlaySound("charactermenu/Pick.mp3")
	FurtherButton:SetAlpha(200)
end
FurtherButton.OnCursorExited = function()
	FurtherButton:SetAlpha(255)
end

local BackButton = vgui.Create("DImageButton", chrSelector)
	BackButton:SetPos(ScrW()/3.35, ScrH()/1.05)
	BackButton:SetSize(ScrW()/10, ScrH()/22)
	BackButton:SetImage( "Selector/BackButton6.png" )
	BackButton:SetVisible(false)
BackButton.OnCursorEntered = function()  surface.PlaySound("charactermenu/Pick.mp3")
	BackButton:SetAlpha(200)
end
BackButton.OnCursorExited = function()
	BackButton:SetAlpha(255)
end

BackButton.DoClick = function() surface.PlaySound("charactermenu/Chose.mp3")
	if page == 1 then
	page=page-1
	BackButton:SetVisible(true)
	PocketButton:SetVisible(true)
	GrispButton:SetVisible(true)
	CrossButton:SetVisible(true)
	EnigmaButton:SetVisible(true)
	AnonButton:SetVisible(false)
	MoraiteruButton:SetVisible(false)
	YaxiButton:SetVisible(false)
	RockButton:SetVisible(false)
	RoxButton:SetVisible(false)
	backImage:SetImage("Selector/fSelector1.png")
	BackButton:SetVisible(false)
	end
	if page == 2 then
	page=page-1
	FurtherButton:SetVisible(true)
	AnonButton:SetVisible(true)
	MoraiteruButton:SetVisible(true)
	YaxiButton:SetVisible(true)
	RockButton:SetVisible(true)
	RoxButton:SetVisible(true)
	RissiButton:SetVisible(false)
	ScarletButton:SetVisible(false)
	TwinButton:SetVisible(false)
	CancelButton:SetVisible(false)
	CorzaButton:SetVisible(false)
	FurtherButton:SetVisible(true)
	end
end

FurtherButton.DoClick = function() surface.PlaySound("charactermenu/Chose.mp3")
	if page == 1 then
	page=page+1
	AnonButton:SetVisible(false)
	MoraiteruButton:SetVisible(false)
	YaxiButton:SetVisible(false)
	RockButton:SetVisible(false)
	RoxButton:SetVisible(false)
	RissiButton:SetVisible(true)
	ScarletButton:SetVisible(true)
	TwinButton:SetVisible(true)
	CancelButton:SetVisible(true)
	CorzaButton:SetVisible(true)
	FurtherButton:SetVisible(false)
	end
	if page == 0 then
	page=page+1
	BackButton:SetVisible(true)
	PocketButton:SetVisible(false)
	GrispButton:SetVisible(false)
	CrossButton:SetVisible(false)
	EnigmaButton:SetVisible(false)
	AnonButton:SetVisible(true)
	MoraiteruButton:SetVisible(true)
	YaxiButton:SetVisible(true)
	RockButton:SetVisible(true)
	RoxButton:SetVisible(true)
	backImage:SetImage("Selector/fSelector2.png")
	end
end

ReturnButton.DoClick = function() surface.PlaySound("charactermenu/Chose.mp3")
	backImage:SetImage("Selector/HomeScreen.png")
	welcomeImage:SetVisible(true)
	despairImage:SetVisible(true)
	monokumaButton:SetVisible(true)
	listDanganronpaImage:SetVisible(true)
	firstRonpaButton:SetVisible(true)
	secondRonpaButton:SetVisible(true)
	thirdRonpaButton:SetVisible(true)
	sdraButton:SetVisible(true)
	rebirthButton:SetVisible(true)
	otherCharacterButton:SetVisible(true)
	fButton:SetVisible(true)
	page =0
	BackButton:Remove()
	FurtherButton:Remove()
	PocketButton:Remove()
	GrispButton:Remove()
	CrossButton:Remove()
	EnigmaButton:Remove()
	AnonButton:Remove()
	MoraiteruButton:Remove()
	YaxiButton:Remove()
	RockButton:Remove()
	RoxButton:Remove()
	RissiButton:Remove()
	ScarletButton:Remove()
	TwinButton:Remove()
	CancelButton:Remove()
	CorzaButton:Remove()
	ReturnButton:Remove()
end
end

otherCharacterButton.DoClick = function() surface.PlaySound("charactermenu/Chose.mp3")
	backImage:SetImage("Selector/OtherSelector.png")
	welcomeImage:SetVisible(false)
	despairImage:SetVisible(false)
	monokumaButton:SetVisible(false)
	listDanganronpaImage:SetVisible(false)
	firstRonpaButton:SetVisible(false)
	secondRonpaButton:SetVisible(false)
	thirdRonpaButton:SetVisible(false)
	sdraButton:SetVisible(false)
	rebirthButton:SetVisible(false)
	otherCharacterButton:SetVisible(false)
	fButton:SetVisible(false)
local MitaraiButton = vgui.Create("DImageButton", chrSelector)
CharButton(MitaraiButton,3200,13.6,5.74,1.17,"Рёта","Mitarai",chrSelector,true)

local RyokoButton = vgui.Create("DImageButton", chrSelector)
CharButton(RyokoButton,5.3,13.6,5.25,1.17,"Рёко Отонаши","Ryoko",chrSelector,true)

local IzuruButton = vgui.Create("DImageButton", chrSelector)
CharButton(IzuruButton,2.55,13.6,5.4,1.17,"Изуру Камукура","Izuru",chrSelector,true)

local KomaruButton = vgui.Create("DImageButton", chrSelector)
CharButton(KomaruButton,1.688,13.6,5.14,1.17,"Комару","Komaru",chrSelector,true)

local SeikoButton = vgui.Create("DImageButton", chrSelector)
CharButton(SeikoButton,1.248,13.6,5,1.17,"Сейко Кимура","Seiko",chrSelector,true)

local ReturnButton = vgui.Create("DImageButton", chrSelector)
	ReturnButton:SetPos(ScrW()/1.4, ScrH()/200)
	ReturnButton:SetSize(ScrW()/6, ScrH()/22)
	ReturnButton:SetImage( "Selector/ReturnMenu6.png" )
ReturnButton.OnCursorEntered = function()  surface.PlaySound("charactermenu/Pick.mp3")
	ReturnButton:SetAlpha(200)
end
ReturnButton.OnCursorExited = function()
	ReturnButton:SetAlpha(255)
end

ReturnButton.DoClick = function() surface.PlaySound("charactermenu/Chose.mp3")
	backImage:SetImage("Selector/HomeScreen.png")
	welcomeImage:SetVisible(true)
	despairImage:SetVisible(true)
	monokumaButton:SetVisible(true)
	listDanganronpaImage:SetVisible(true)
	firstRonpaButton:SetVisible(true)
	secondRonpaButton:SetVisible(true)
	thirdRonpaButton:SetVisible(true)
	sdraButton:SetVisible(true)
	rebirthButton:SetVisible(true)
	otherCharacterButton:SetVisible(true)
	fButton:SetVisible(true)
	page =0
	MitaraiButton:Remove()
	RyokoButton:Remove()
	IzuruButton:Remove()
	KomaruButton:Remove()
	SeikoButton:Remove()
	ReturnButton:Remove()
end
end

monokumaButton.DoClick = function() surface.PlaySound("charactermenu/Chose.mp3")
	backImage:SetImage("Selector/MonokumaSelector.png")
	welcomeImage:SetVisible(false)
	despairImage:SetVisible(false)
	monokumaButton:SetVisible(false)
	listDanganronpaImage:SetVisible(false)
	firstRonpaButton:SetVisible(false)
	secondRonpaButton:SetVisible(false)
	thirdRonpaButton:SetVisible(false)
	sdraButton:SetVisible(false)
	rebirthButton:SetVisible(false)
	otherCharacterButton:SetVisible(false)
	fButton:SetVisible(false)
	
local MonoButton = vgui.Create("DImageButton", chrSelector)
CharButton(MonoButton,3200,13.6,4.17,1.17,"Монокума","Monokuma",chrSelector,true)

local MonotaroButton = vgui.Create("DImageButton", chrSelector)
CharButton(MonotaroButton,3.95,13.6,6.65,2.48,"Монотаро","Monotaro",chrSelector,true)

local MonosukeButton = vgui.Create("DImageButton", chrSelector)
CharButton(MonosukeButton,2.41,13.6,6.65,2.48,"Моноске","Monosuke",chrSelector,true)

local MonokidButton = vgui.Create("DImageButton", chrSelector)
CharButton(MonokidButton,1.68,13.6,6.3,2.48,"Монокид","Monokid",chrSelector,true)

local MonofunnyButton = vgui.Create("DImageButton", chrSelector)
CharButton(MonofunnyButton,3.95,2.025,4.2,2.3,"Монофанни","Monofunny",chrSelector,true)

local MonodamButton = vgui.Create("DImageButton", chrSelector)
CharButton(MonodamButton,1.99,2.025,4,2.3,"Монодам","Monodam",chrSelector,true)

local UsamiButton = vgui.Create("DImageButton", chrSelector)
CharButton(UsamiButton,1.302,13.6,4.2,1.17,"Усами","Usami",chrSelector,true)

local ReturnButton = vgui.Create("DImageButton", chrSelector)
	ReturnButton:SetPos(ScrW()/1.4, ScrH()/200)
	ReturnButton:SetSize(ScrW()/6, ScrH()/22)
	ReturnButton:SetImage( "Selector/ReturnMenu7.png" )
ReturnButton.OnCursorEntered = function()  surface.PlaySound("charactermenu/Pick.mp3")
	ReturnButton:SetAlpha(200)
end
ReturnButton.OnCursorExited = function()
	ReturnButton:SetAlpha(255)
end

ReturnButton.DoClick = function() surface.PlaySound("charactermenu/Chose.mp3")
	backImage:SetImage("Selector/HomeScreen.png")
	welcomeImage:SetVisible(true)
	despairImage:SetVisible(true)
	monokumaButton:SetVisible(true)
	listDanganronpaImage:SetVisible(true)
	firstRonpaButton:SetVisible(true)
	secondRonpaButton:SetVisible(true)
	thirdRonpaButton:SetVisible(true)
	sdraButton:SetVisible(true)
	rebirthButton:SetVisible(true)
	otherCharacterButton:SetVisible(true)
	fButton:SetVisible(true)
	page =0
	MonoButton:Remove()
	MonotaroButton:Remove()
	MonosukeButton:Remove()
	MonokidButton:Remove()
	MonofunnyButton:Remove()
	MonodamButton:Remove()
	UsamiButton:Remove()
	ReturnButton:Remove()
end
end



timer.Simple(0.1,function() 
kost = true
end)
end
end)

print("CharServer saved")