print('client has been loaded')

			local newMessages = {}

--RunConsoleCommand("con_enable", "0")
local objtrue = true
hook.Add("Initialize", "suka", function()
	GM = GM or GAMEMODE
	
	function GM:PlayerStartVoice(ply)
		return
	end

end)
hook.Add("Think", "suka", function()
	GM = GM or GAMEMODE


	function GM:PlayerStartVoice(ply)
		return
	end
	
end)
local playersTable = nil

local voiceover = "eng"
net.Receive("EngJap", function ()
	voiceover = net.ReadString()
end)

local namePSC = ""
local nameSC = ""


net.Receive("ChangeNameSpriteClient", function(len,ply)
    local tabSPR = net.ReadTable()
    namePSC = tabSPR[1]
	nameSC = tabSPR[2]
end)

local rules = {"Правила поведения","Монокума не может вмешиваться в убийство или причинять вред ученику без веской причины. ","Убирайте за собой мусор и не вридите окружающей природе.","Вы находитесь в цивилизованном обществе, а потому запрещенно рыскать по вентиляциям и связывать или запирать человека против его воли.","Запрещенно наносить повреждения Монокуме.","Когда ученик убивает другого ученика, то он становиться выпускником и правила с условием 'ученик' на него более не распростроняються.","Выпускнику запрещается совершать более двух актов убийства.","В ходе суда ученики и выпускник имеют право на одну подсказку( все вместе, а не по отдельности).","Обнаружение тела происходит когда три и более учеников обнаруживают тело.","Если после нахождения первого тела происходит обнаружение второго, то расследуется дело первого если только правило 10 не внесёт поправки.","Если вторым телом оказался выпускник первого тела, а сам выпускник стал жертвой другого выпускника, то расследуется дело того выпускника кто пока жив.","Особых ограничений в исследовании Академии не будет.","Преднамеренный сон вне лабораторий и комнат считаеться нарушением и карается казнью.","Если выпускник был обнаружен и за него проголосовало большенство, то ученики выживают, а выпускник погибает. Если же выпускник был определён неправильно, то наоборот.","Запрещено взламывать двери.","В случае если выживших останется только двое, то они оба покинут академию.","Монокума может добавлять правила по мере необходимости."}

local monocoins = 0 
local notify = {}
local BDAProbs = {}
local SpriteFolder ='Byakuya'
local CountOfSprites = 15
local BadgeTable = {"No","No","No","No","No"}
local SpriteCount
local function RemoveHealth (myhud)
for k,v in pairs{'CHudBattery', "CHudHealth", 'CHudAmmo',	 'CTeamPlayHud', "CAchievementNotificationPanel", "CHudVoiceStatus" , "CHudVoiceSelfStatus"} do
if myhud == v then return false
end
end
end
hook.Add('HUDShouldDraw','HudHide',RemoveHealth)

local _panel
local _button
local _UI
local _obj
local _con
local _liv
local _objScnd
local _animbox
local MoveCameraclr = Color(0,0,0,150)
local Concernclr = Color(0,0,0,150)
local Angueclr = Color(0,0,0,150)
local EmotionBoxColor = Color(14,91,194)
local Emotionclr = Color(255,255,255,255)

local TextColor = Color(255,255,255)
local CameraAnimationNumber = 0
local TrialSoundNumber = 0
local SendedSound = 0


local CharName = "Monokuma"

local announcementSound = true


local changechar = true
net.Receive("StopCameras2", function()
        MoveCameraclr = Color(0,0,0,200)
        changechar = false
        timer.Simple(5, function()
                changechar = true
        MoveCameraclr = Color(0,0,0,150)
                end)
    end)
local function RotateDrum(Inner, Outer, count)
    if (Inner:IsValid()) then
    Inner:SetRotation(-count)
    Outer:SetRotation(count)
     timer.Simple(0.01, function()
            RotateDrum(Inner, Outer, count+0.1)
                end)
        end
    end
local function RotateDrum(Inner, Outer, count, speed)
    if (Inner:IsValid()) then
    Inner:SetRotation(-count)
    Outer:SetRotation(count)
     timer.Simple(0.01, function()
            RotateDrum(Inner, Outer, count+speed, speed)
                end)
        end
    end

local function EmotionCooldown(line, w,h)
    if w > -10 then
        line:SetSize(w,h)
    timer.Simple(0.025, function()
            EmotionCooldown(line, w-12,h)
                end)
        end
    end
local Face = nil
local function LoadSpriteMaterials()

    end
local co
local function OpenImageBoard()

        co = coroutine.create( LoadSpriteMaterials )
    coroutine.resume( co )

	local backUI = vgui.Create("DImage")
	_UI = backUI
	backUI:SetImage("materials/sprites/UI/trial/canvas back.png")
    backUI:SetSize(ScrW(), ScrH())
    local Portair = vgui.Create("DImage", backUI)
    Face = Portair
    Portair:SetImage("materials/sprites/UI/trial/portairs/"..CharName..".png")
	Portair:SetSize(ScrW(), ScrH())
    local UI = vgui.Create("DImage", backUI)
    UI:SetImage("materials/sprites/UI/trial/canvas.png")
	UI:SetSize(ScrW(), ScrH())

    local RevolverDrumInside = vgui.Create("DSprite", backUI)
    RevolverDrumInside:SetMaterial(Material("sprites/UI/trial/InnerCircle"))
	RevolverDrumInside:SetSize(400, 400)
    RevolverDrumInside:SetPos(ScrW()/1920*337, ScrH()/1080*992)
    RevolverDrumInside:SetColor(Color(0,0,0))
    local RevolverDrumOutside = vgui.Create("DSprite", backUI)
    RevolverDrumOutside:SetMaterial(Material("sprites/UI/trial/OuterCircle"))
	RevolverDrumOutside:SetSize(400, 400)
    RevolverDrumOutside:SetColor(Color(0,0,0))
    RevolverDrumOutside:SetPos(ScrW()/1920*337, ScrH()/1080*992)
    RotateDrum(RevolverDrumInside, RevolverDrumOutside, 0, 0.1)
    local RevolverDrumInside2 = vgui.Create("DSprite", backUI)
    RevolverDrumInside2:SetMaterial(Material("sprites/UI/trial/InnerCircle"))
    RevolverDrumInside2:SetSize(300, 300)
    RevolverDrumInside2:SetPos(ScrW()/1920*1481, ScrH()/1080*819)
    RevolverDrumInside2:SetColor(Color(0,0,0))
    local RevolverDrumOutside2 = vgui.Create("DSprite", backUI)
    RevolverDrumOutside2:SetMaterial(Material("sprites/UI/trial/OuterCircle"))
    RevolverDrumOutside2:SetSize(300, 300)
    RevolverDrumOutside2:SetColor(Color(0,0,0))
    RevolverDrumOutside2:SetPos(ScrW()/1920*1481, ScrH()/1080*819)
    RotateDrum(RevolverDrumInside2, RevolverDrumOutside2, 0, -0.1)
    local ClassTrial = vgui.Create("DImage", backUI)
    ClassTrial:SetSize(ScrW(),ScrH())
    ClassTrial:SetImage("materials/sprites/UI/trial/ClassTrial.png")
    ClassTrial:SetPos(0,0)
    local ClassTrialNumber = vgui.Create("DImage", backUI)
    ClassTrialNumber:SetSize(ScrW(),ScrH())
    if (tonumber(DDFChapter) < 6) then
    ClassTrialNumber:SetImage("materials/sprites/UI/trial/".. DDFChapter ..".png")
        else
         ClassTrialNumber:SetImage("materials/sprites/UI/trial/0.png")
        end
    ClassTrialNumber:SetPos(0,0)
	local Line = vgui.Create("DImage", backUI)
	Line:SetSize(0,10)
    Line:SetImage("materials/sprites/UI/trial/Line.png")
    Line:SetPos(10,0)
	if SpriteFolder ~= "Table" then
       
        local frame = vgui.Create( "DFrame" )
	_animbox = frame
	frame:SetSize( 410, 45 )
	frame:MakePopup()
	frame:SetPos(10, ScrH()*3/5+15)
	frame:SetKeyboardInputEnabled(false)
    frame:ShowCloseButton( false )
    frame:SetDraggable( false )
    frame.Paint = function (self,w,h)
end

     local DSoundBox = vgui.Create("DComboBox", frame)
    DSoundBox:SetSize(410, 20)
    DSoundBox:SetPos(0, 25)
    DSoundBox:SetValue( "Звук" )
    DSoundBox:AddChoice( "Без звука" )
    DSoundBox:AddChoice( "Ветер" )
    DSoundBox:AddChoice( "Взрыв" )
    DSoundBox:AddChoice( "Дзыыынь" )
    DSoundBox:AddChoice( "Магия" )
    DSoundBox:AddChoice( "Мистика" )
    DSoundBox:AddChoice( "Недоумение" )
    DSoundBox:AddChoice( "Обрушение" )
    DSoundBox:AddChoice( "ОЙ" )
    DSoundBox:AddChoice( "Радость" )
    DSoundBox:AddChoice( "Разочарование" )
    DSoundBox:AddChoice( "Смятение" )
    DSoundBox:AddChoice( "Стандартное замечание" )
    DSoundBox:AddChoice( "Счастье" )
    

    DSoundBox.OnSelect = function( self, index, value )
		TrialSoundNumber = index
    	surface.PlaySound( "trialsound/"..index..".mp3" )
	end

    local DAnimationBox = vgui.Create("DComboBox", frame)

    DAnimationBox:SetSize(410, 20)

    DAnimationBox:SetValue( "Анимация" )
    DAnimationBox:AddChoice( "Без анимации" )
    DAnimationBox:AddChoice( "Стандартная" )
    DAnimationBox:AddChoice( "Стандартная + наклон" )
    DAnimationBox:AddChoice( "Быстрое вращение" )
    DAnimationBox:AddChoice( "Медленное вращение" )

    DAnimationBox.OnSelect = function( self, index, value )
		CameraAnimationNumber = index
	end
        
    local cameraPerevod = true
    
	local MoveCameraToMe = vgui.Create('DButton')
	_button = MoveCameraToMe
	MoveCameraToMe:SetPos(10,ScrH()*3/5+65)
	MoveCameraToMe:SetSize(133,40)
	MoveCameraToMe:SetText("Перевести камеру")
	MoveCameraToMe:SetTextColor(TextColor)
	MoveCameraToMe.DoClick = function()
	net.Start("StartCameraAnimation")
	local tableCount ={SpriteFolder,false,CameraAnimationNumber,TrialSoundNumber}
	net.WriteTable(tableCount)
	net.SendToServer()

            if (CameraAnimationNumber == 4 or CameraAnimationNumber == 5) then
                DAnimationBox:ChooseOptionID(1)
            end
            DSoundBox:ChooseOptionID(1)
                
		
end
	MoveCameraToMe.Paint = function (self,w,h)
		draw.RoundedBoxEx(5,0,0,w,h,MoveCameraclr, true, false, true, false)
	end
    
local Consent = vgui.Create('DButton')
	_con = Consent
	Consent:SetPos(148,ScrH()*3/5+65)
	Consent:SetSize(133,40)
	Consent:SetText("Согласиться")
	Consent:SetTextColor(TextColor)
        local single5 = true
	Consent.DoClick = function()
            if single5 == true then
    	single5 = false
                Concernclr = Color(0,0,0,200)
net.Start("Consent")
net.WriteString(SpriteFolder)
net.SendToServer()
                 timer.Simple(5, function()
                        Concernclr = Color(0,0,0,100)
	single5 = true
	end)
	end
end

	Consent.Paint = function (self,w,h)
draw.RoundedBox(0,0,0,w,h,Concernclr)
end
end
    
    local Objection = vgui.Create('DButton')
	_obj = Objection
	Objection:SetPos(286,ScrH()*3/5+65)
	Objection:SetSize(133,40)
	Objection:SetText("Опровергнуть")
	Objection:SetTextColor(TextColor)
	Objection.DoClick = function()
        if objtrue == true then
	net.Start("StartCameraAnimation")
	local tableCount ={SpriteFolder,true,CameraAnimationNumber,TrialSoundNumber}
	net.WriteTable(tableCount)
net.SendToServer()
end
        end    
	Objection.Paint = function (self,w,h)
draw.RoundedBoxEx(5,0,0,w,h,Angueclr, false, true, false, true)
end


    
if SpriteFolder == "Table" then
local LeaveTrial = vgui.Create('DButton')
	_liv = LeaveTrial
	LeaveTrial:SetPos(10,ScrH()*3/5+20)
	LeaveTrial:SetSize(400,40)
	LeaveTrial:SetText("Покинуть суд")
	LeaveTrial:SetTextColor(TextColor)
	LeaveTrial.DoClick = function()
net.Start("EndSingleTrial")
net.WriteString(LocalPlayer():GetName())
net.SendToServer()
end
	LeaveTrial.Paint = function (self,w,h)
draw.RoundedBox(5,0,0,w,h,Color(0,55,105,100))
end
end
     local EmotionBox = vgui.Create("DImage", backUI)
    EmotionBox:SetImage("materials/sprites/UI/trial/EmotionBox.png")
    EmotionBox:SetSize(410,ScrH()*3/5)
    EmotionBox:SetPos(10,10)
    print(EmotionBox:IsMouseInputEnabled())
local Panel = vgui.Create('DScrollPanel')
_panel = Panel
Panel:SetSize(400,ScrH()*3/5-10)
Panel:SetPos(10,15)
Panel.Paint = function (self,w,h)
end
    
hook.Add("PlayerButtonDown", "hideWindowsOnSettings", function(ply,button)
	if ( IsFirstTimePredicted() and button == 28) then
		if(EmotionBox:IsVisible()) then
			EmotionBox:AlphaTo(50, 0.2,0,function()
				EmotionBox:Hide()
            end)
           	Panel:AlphaTo(50, 0.2,0,function()
				Panel:Hide()
            end)
            _animbox:AlphaTo(50, 0.2,0,function()
				_animbox:Hide()
            end)
            _button:AlphaTo(50, 0.2,0,function()
				_button:Hide()
            end)
            _con:AlphaTo(50, 0.2,0,function()
				_con:Hide()
            end)
            _obj:AlphaTo(50, 0.2,0,function()
				_obj:Hide()
            end)
		else
			EmotionBox:Show()
			EmotionBox:AlphaTo(255, 0.2,0,function()
            end)
            Panel:Show()
           	Panel:AlphaTo(255, 0.2,0,function()
            end)
            _animbox:Show()
           	_animbox:AlphaTo(255, 0.2,0,function()
            end)
            _button:Show()
           	_button:AlphaTo(255, 0.2,0,function()
            end)
            _con:Show()
           	_con:AlphaTo(255, 0.2,0,function()
            end)
            _obj:Show()
           	_obj:AlphaTo(255, 0.2,0,function()
            end)
		end
	end
end)

   
local count = 0
Panel:MoveToBack()
    local clr = Color(0,55,105,100)
                    local single6 = true
for j =0, 40 do
for i=0,2 do
if count < CountOfSprites then
local Path ='materials/sprites/'..SpriteFolder..'/'..count..'.png'
local Button = vgui.Create('DButton',Panel)
Panel:AddItem(Button)
Button:SetSize(110,110)
Button:SetPos(20+i*125,10+j*125)
Button:SetText('')
Button.Paint = function(self,w,h)
end
	local EmotionSmallBox = vgui.Create("DImage", Button)
    EmotionSmallBox:SetImage("materials/sprites/UI/trial/Emotion.png")
    EmotionSmallBox:SetSize(110,110)
    EmotionSmallBox:SetPos(0,0)
    local Emotion = vgui.Create("DImage", Button)
    Emotion:SetImage(Path)
    Emotion:SetSize(110,110)
    Emotion:SetPos(0,0)
    Emotion:SetImageColor(Emotionclr)
    local EmotionSmallBoxRownd = vgui.Create("DImage", Button)
    EmotionSmallBoxRownd:SetImage("materials/sprites/UI/trial/EmotionRownd.png")
    EmotionSmallBoxRownd:SetSize(110,110)
    EmotionSmallBoxRownd:SetPos(0,0)
net.Start("SendSpriteToAll")
net.WriteString(Path)
net.SendToServer()
local NumberOfSprite = count
count=count+1

Button.DoClick = function()
                    if single6 == true then
                        single6 = false
                        
net.Start("ChangeSprite1")
net.WriteFloat(NumberOfSprite)
net.WriteString(SpriteFolder)
net.SendToServer()
EmotionCooldown(Line, 400,10)
timer.Simple(1, function()
	single6 = true
	end)
	end                        
end
end
end
end
end
local SdraCharName = "CharName"
local _sdracharname
net.Receive("GetCharName", function ()
	SdraCharName = net.ReadString()
	_sdracharname:SetText(SdraCharName)
	end)


net.Receive("SendName2", function ()
			CharName = net.ReadString()
       		 if (CharName == "Nico") then
				CharName = "Niko"
			end
			if(file.Find("materials/sprites/UI/trial/portairs/"..CharName..".png","WORKSHOP")[1]==nil) then
				CharName = "Empty"
			end
			Face:SetImage("materials/sprites/UI/trial/portairs/"..CharName..".png")
            timer.Simple(0.1, function()
            surface.PlaySound( "trialsound/"..SendedSound..".mp3" )
                    end)
	end)


local single = true
net.Receive ('Consent2', function()
	local path = net.ReadString()
	if single == true then
		if voiceover == "jap" then
			path = "jap/"..path
		else
			path = path
		end
		sound.PlayFile( "sound/Consern/".. path..".mp3", "", function( channel )
		channel:Play()
		channel:SetVolume( 1 )
		end)
		single = false
		timer.Simple(0.1, function() 
			single = true
		end)

	end
end )

net.Receive("SendSoundNumber2", function()
        SendedSound = net.ReadFloat()
    end)


net.Receive("NightAnnounsment", function()
	sound.PlayFile( "sound/dayswitchsound.mp3", "", function( channel )
		channel:Play()
		channel:SetVolume( 0.2 )
		end)
		
end)
net.Receive("MorningAnnounsment", function()
	sound.PlayFile( "sound/dayswitchsound.mp3", "", function( channel )
		channel:Play()
		channel:SetVolume( 0.2 )
		end)
	end)
function GetSpriteFolder(Name)
	local PlayerName = LocalPlayer():Nick()
	if Name ~= "" and Name ~= nil then
PlayerName = Name
	end

if PlayerName == "Макото Наеги" or PlayerName == "Макото Наэги" then 
	Name = "Makoto"
		elseif (PlayerName == namePSC) then 
		Name = nameSC
		elseif (PlayerName == "Акане Овари" or PlayerName == "Аканэ Овари") then 
		Name = "Akane"
		elseif (PlayerName == "Анджи Йонага" or PlayerName == "Анджи Ёнага") then 
		Name = "Angie"
		elseif PlayerName == "Аой Асахина" then 
		Name = "Aoi"
		elseif PlayerName == "Чиаки Нанами" then 
		Name = "Chiaki"
		elseif (PlayerName == "Селестия Люденбург" or PlayerName == "Селестия Люденбёрг" or PlayerName == "Селестия Люденберг") then 
		Name = "Celestia"
		elseif PlayerName == "Бьякуя Тогами" then 
		Name = "Byakuya"
        elseif PlayerName == "Импостер" then 
		Name = "Imposter"
		elseif PlayerName == "Чихиро Фуджисаки" then 
		Name = "Chihiro"
		elseif PlayerName == "Фуюхико Кузурю" then 
		Name = "Fuyuhiko"
		elseif PlayerName == "Гонта Гокухара" then 
		Name = "Gonta"
		elseif PlayerName == "Гандам Танака" then 
		Name = "Gundham"
		elseif (PlayerName == "Хаджиме Хината" or PlayerName == "Хадзиме Хината") then 
		Name = "Hajime"
		elseif (PlayerName == "Изуру Камукура") then 
		Name = "Kamukura"
        elseif (PlayerName == "Изуру Камакура") then 
		Name = "Izuru"
		elseif PlayerName == "Хифуми Ямада" then 
		Name = "Hifumi"
		elseif PlayerName == "Химико Юмено" then 
		Name = "Himiko"
		elseif (PlayerName == "Хиёко Сайонджи" or PlayerName == "Хиёко Сайондзи")then 
		Name = "Hiyoko"
		elseif PlayerName == "Ибуки Миода" then 
		Name = "Ibuki"
		elseif PlayerName == "Джунко Эношима" then 
		Name = "Junko"
        elseif PlayerName == "Мукуро Икусаба" then 
		Name = "Mukuro"
		elseif (PlayerName == "K1-B0" or PlayerName == "Киибо"or PlayerName == "Кибо") then 
		Name = "K1-B0"
		elseif (PlayerName == "Каедэ Акаматсу" or PlayerName == "Каэдэ Акаматсу") then 
		Name = "Kaede"
		elseif (PlayerName == "Каэдe Акаматсу" or PlayerName == "Каедe Акаматсу") then 
		Name = "Kaede"
		elseif (PlayerName == "Каедэ Акамацу" or PlayerName == "Каэдэ Акамацу") then 
		Name = "Kaede"
		elseif (PlayerName == "Каэдe Акамацу" or PlayerName == "Каедe Акамацу") then 
		Name = "Kaede"
		elseif (PlayerName == "Кайто Момота" or PlayerName == "Каито Момота") then 
		Name = "Kaito"
		elseif (PlayerName == "Казуичи Сода" or PlayerName == "Казуити Сода") then 
		Name = "Kazuichi"
		elseif PlayerName == "Кируми Тоджо" then 
		Name = "Kirumi"
		elseif (PlayerName == "Киётака Ишимару" or PlayerName == "Кийотака Ишимару") then 
		Name = "Kiyotaka"
		elseif PlayerName == "Кокичи Ома" then 
		Name = "Kokichi"
		elseif (PlayerName == "Корекиё Шингуджи" or PlayerName == "Корекиё Шингудзи" or PlayerName == "Корекие Шингуджи" or PlayerName == "Корекие Шингудзи") then 
		Name = "Korekiyo"
		elseif PlayerName == "Кёко Киригири" then 
		Name = "Kyoko"
		elseif PlayerName == "Леон Кувата" then 
		Name = "Leon"
		elseif (PlayerName == "Махиру Коидзуми" or PlayerName == "Махиру Коизуми") then 
		Name = "Mahiru"
		elseif PlayerName == "Маки Харукава" then 
		Name = "Maki"
		elseif (PlayerName == "Микан Тсумики" or PlayerName == "Микан Цумики") then 
		Name = "Mikan"
		elseif PlayerName == "Миу Ирума" then 
		Name = "Miu"
		elseif PlayerName == "Мондо Овада" then 
		Name = "Mondo"
		elseif PlayerName == "Монодам" then 
		Name = "Monodam"
		elseif PlayerName == "Монокид" then 
		Name = "Monokid"
		elseif PlayerName == "Монокума" then 
		Name = "Monokuma"
        elseif PlayerName == "Курокума" then 
		Name = "Kurokuma"
        elseif PlayerName == "Усами" then 
		Name = "Usami"
		elseif PlayerName == "Монофанни" then 
		Name = "Monophanie"
		elseif PlayerName == "Моноске" then 
		Name = "Monosuke"
		elseif PlayerName == "Монотаро" then 
		Name = "Monotaro"
		elseif (PlayerName == "Нагито Комаеда" or PlayerName == "Нагито Комаэда") then 
		Name = "Nagito"
		elseif PlayerName == "Некомару Нидай" then 
		Name = "Nekomaru"
		elseif PlayerName == "Пеко Пекояма" then 
		Name = "Peko"
		elseif PlayerName == "Рантаро Амами" then 
		Name = "Rantaro"
		elseif PlayerName == "Рёма Хоши" then 
		Name = "Ryoma"
		elseif PlayerName == "Сакура Огами" then 
		Name = "Sakura"
		elseif (PlayerName == "Саяка Маизоно" or PlayerName == "Саяка Майзоно") then 
		Name = "Sayaka"
		elseif (PlayerName == "Шуичи Саихара" or PlayerName == "Шуичи Сайхара") then 
		Name = "Shuichi"
		elseif (PlayerName == "Сония Невермайнд" or PlayerName == "Соня Невермайнд" or PlayerName == "Сонья Невермайнд") then 
		Name = "Sonia"
		elseif PlayerName == "Тенко Чабашира" then 
		Name = "Tenko"
		elseif PlayerName == "Терутеру Ханамура" then 
		Name = "Teruteru"
		elseif PlayerName == "Токо Фукава" then 
		Name = "Toko"
		elseif PlayerName == "Терутеру Ханамура" then 
		Name = "Teruteru"
		elseif (PlayerName == "Тсумуги Широгане" or PlayerName == "Цумуги Широгане" or PlayerName == "Тсумуги Широганэ" or PlayerName == "Цумуги Широганэ") then 
		Name = "Tsumugi"
		elseif (PlayerName == "Ясухиро Кагакурэ" or PlayerName == "Ясухиро Хагакурэ" or PlayerName == "Ясухиро Кагакуре" or PlayerName == "Ясухиро Хагакуре") then 
		Name = "Yasuhiro"
        elseif (PlayerName == "Юкари Коиме") then 
		Name = "Yukari"
        elseif (PlayerName == "Чинами Хасами") then 
		Name = "Chinami"
		elseif PlayerName == "Эмма Магороби" then 
		Name = "Emma"
		elseif PlayerName == "Шобай Хашимото" then 
		Name = "Shobai"
		elseif PlayerName == "Хибики Отонокоджи" then 
		Name = "Hibiki"
		elseif PlayerName == "Ироха Ниджиуэ" then 
		Name = "Iroha"
		elseif PlayerName == "Канаде Отонокоджи" then 
		Name = "Kanade"
		elseif PlayerName == "Кокоро Митсуме" then 
		Name = "Kokoro"
		elseif PlayerName == "Хаджиме Макуноучи" then 
		Name = "Makunouchi"
		elseif PlayerName == "Микадо Санноджи" then 
		Name = "Mikado"
		elseif PlayerName == "Никей Йомиури" then 
		Name = "Nikei"
		elseif PlayerName == "Сетсука Чибукуро" or PlayerName == "Сецука Чибукуро" then 
		Name = "Setsuka"
		elseif PlayerName == "Шинджи Касай" then 
		Name = "Shinji"
		elseif PlayerName == "Теруя Отори" then 
		Name = "Teruya"
		elseif PlayerName == "Йоруко Кабуя" then 
		Name = "Yoruko"
		elseif PlayerName == "Юки Маеда" then 
		Name = "Yuki"
		elseif PlayerName == "Сора" then 
		Name = "Sora"
		elseif PlayerName == "Юри Кагарин" then 
		Name = "Yuri"
		elseif PlayerName == "Монокров" then 
		Name = "Monocrow"
		elseif PlayerName == "Рёта Митарай" then 
		Name = "Ryota"
		elseif PlayerName == "Нико Химуро" then 
		Name = "Nico"
		elseif PlayerName == "Килллакума" then 
		Name = "Killlakuma"
		elseif PlayerName == "Марин Мизута" then 
		Name = "Marin"
		elseif PlayerName == "Сейко Кимура" then 
		Name = "Seiko"
		elseif PlayerName == "Шуичи Сaихара" or PlayerName == "Шуичи Сaйхара" then 
		Name = "Femaleshuichi"
		elseif PlayerName == "Кaедэ Акаматсу" then 
		Name = "Malekaede"
		elseif PlayerName == "Комару Наеги" then 
		Name = "Komaru"
		elseif PlayerName == "Тcумуги Широгане" then 
		Name = "Maletsumugi"
        elseif PlayerName == "Минамото Тетсуо" then 
		Name = "Minamoto"
        elseif PlayerName == "Усами" then 
		Name = "usami"
        elseif PlayerName == "Сейши Йодогава" then 
		Name = "Seishi"
		elseif PlayerName == "Аюму Фуджимори" then 
		Name = "Ayumu"
		elseif PlayerName == "Акира Цучия" then 
		Name = "Akira"
		elseif PlayerName == "Арума Тодороки" then 
		Name = "Aruma"
		elseif PlayerName == "Касуми Изумо" then 
		Name = "Kasumi"
		elseif PlayerName == "Казуоми Самеджима" then 
		Name = "Kazuomi"
		elseif PlayerName == "Кего Сакума" then 
		Name = "Kego"
		elseif PlayerName == "Майко Кагура" then 
		Name = "Maiko"
		elseif PlayerName == "Микото Итсуки" then 
		Name = "Mikoto"
		elseif PlayerName == "Мисузу Айсака" then 
		Name = "Misuzu"
		elseif PlayerName == "Мицунари Кога" then 
		Name = "Mitsunari"
		elseif PlayerName == "Наруми Осоне" then 
		Name = "Narumi"
		elseif PlayerName == "Сайджи Рокудо" then 
		Name = "Saiji"
		elseif PlayerName == "Рёко Отонаши" then 
		Name = "Ryoko"
        elseif PlayerName == "Мисако Рокухана" then
		Name = "Misako"
		elseif PlayerName == "Мин Чжун" then 
		Name = "Min"
        elseif PlayerName == "Мисаки Хомма" then 
		Name = "Misaki"
        elseif PlayerName == "Йоши Симудзу" then 
		Name = "Yoshi"
		elseif PlayerName == "Нана Игараси" then 
		Name = "Nana"
		elseif PlayerName == "Шу Ямамото" then 
		Name = "Shu"
		elseif PlayerName == "Рюдзи Гото" then 
		Name = "Ryuuji"
		elseif PlayerName == "Кохару Китамура" then 
		Name = "Koharu"
		elseif PlayerName == "Йоширо Тогучи" then 
		Name = "Yoshiro"
		elseif PlayerName == "Аюми Хирано" then 
		Name = "Ayumi"
        elseif PlayerName == "Хидеки Такада" then 
		Name = "Hideki"
		elseif PlayerName == "Кермит Невилл" then 
		Name = "Kermit"
        elseif PlayerName == "Хидеёси Сигуяма" then 
		Name = "Hideyoshi"
        elseif PlayerName == "Мари Цудзи" then 
		Name = "Mari"
        elseif PlayerName == "Торо Хаттори" then 
		Name = "Toro"
		elseif PlayerName == "Сецуко Хиросэ" then 
		Name = "Setsuko"
        elseif PlayerName == "Йоко Нагата" then 
		Name = "Yoko"
        elseif PlayerName == "Рикуто Минами" then 
		Name = "Rikuto"
        elseif PlayerName == "Покет" then 
		Name = "Pocket"
        elseif PlayerName == "Грисп" then 
		Name = "Grisp"
        elseif PlayerName == "Кросс" then 
		Name = "Cross"
        elseif PlayerName == "Энигма" then 
		Name = "Enigma"
        elseif PlayerName == "Анон" then 
		Name = "Anon"
        elseif PlayerName == "Мораитеру" then 
		Name = "Moraiteru"
        elseif PlayerName == "Якси" then 
		Name = "Yaxi"
        elseif PlayerName == "Рок" then 
		Name = "Rock"
        elseif PlayerName == "Рокс" then 
		Name = "Rox"
        elseif PlayerName == "Рисси" then 
		Name = "Rissi"
        elseif PlayerName == "Скарлет" then 
		Name = "Scarlet"
        elseif PlayerName == "Твин" then 
		Name = "Twin"
        elseif PlayerName == "Канцел" then 
		Name = "Cancel"
        elseif PlayerName == "Корза" then 
		Name = "Corza"
                elseif PlayerName == "Сара Чидоин" then 
		Name = "Sara"
                elseif PlayerName == "Джо Тазуна" then 
		Name = "Joe"
                elseif PlayerName == "Кейджи Шиноги" then 
		Name = "Keiji"        
    			elseif PlayerName == "Канна Кизучи" then 
		Name = "Kanna"
                elseif PlayerName == "Кью-таро Бургерберг" then 
		Name = "Q-taro"
                elseif PlayerName == "Соу Хиёри" or PlayerName == "Шин Тсукими" then 
		Name = "Shin"
                elseif PlayerName == "Реко Ябусаме" then 
		Name = "Reko"
                elseif PlayerName == "Гин Ибуш" then 
		Name = "Gin"
                elseif PlayerName == "Элис Ябусаме" or PlayerName == "Гонби Ямада" then 
		Name = "Alice"
                elseif PlayerName == "Ранмару Кагеяма" then 
		Name = "Ranmaru"
                elseif PlayerName == "Май Тсуруги" then 
		Name = "Mai"
                        elseif PlayerName == "Сью Майли" then 
		Name = "Sue"
                        elseif PlayerName == "Тиа Сафалин" then 
		Name = "Safalin"
                        elseif PlayerName == "Гашу" then 
		Name = "Gashu"
        elseif PlayerName == "Соу Хиери" then 
		Name = "Midori"
                        elseif PlayerName == "Мейстер" then 
		Name = "Meister"
        elseif PlayerName == "Казуми Мишима" then 
		Name = "Kazumi"
        elseif PlayerName == "Наомичи Курумада" then 
		Name = "Naomichi"
        elseif PlayerName == "Рио Рейнджер" then 
		Name = "Rio"
        elseif PlayerName == "Мидори" then 
		Name = "Midori"     

		elseif PlayerName == "Деймон Майтсу" then 
		Name = "Damon"
		elseif PlayerName == "Тошико Каюра" then 
		Name = "Toshiko"
		elseif PlayerName == "Вольфганг Акире" then 
		Name = "Wolfgang"
		elseif PlayerName == "Ева Тсунака" then 
		Name = "Eva"
		elseif PlayerName == "Диана Вениция" then 
		Name = "Diana"
		elseif PlayerName == "Кай Монтеаго" then 
		Name = "Kai"
		elseif PlayerName == "Кэсседи Эмбер" then 
		Name = "Cassidy"
		elseif PlayerName == "Жан Дэламер" then 
		Name = "Jean"
		elseif PlayerName == "Жан Дэламер" then 
		Name = "Jean"
		elseif PlayerName == "Ингрид Гримвалл" then 
		Name = "Ingrid"
		elseif PlayerName == "Джетт Даусон" then 
		Name = "Jett"
		elseif PlayerName == "Венона" then 
		Name = "Wenona"
		elseif PlayerName == "Улисс Вильгельм" then 
		Name = "Ulysses"
		elseif PlayerName == "Элоиз Таулнер" then 
		Name = "Eloise"
		elseif PlayerName == "Дезмонд Холл" then 
		Name = "Desmond"
		elseif PlayerName == "Грейс Мэдисон" then 
		Name = "Grace"
		elseif PlayerName == "Марк Берский" then 
		Name = "Mayhem"

	    elseif PlayerName == "Кэрон Шиока" then 
        Name = "Charon"
        elseif PlayerName == "Реджинальд Блэкмен" then 
        Name = "Wrench"
        elseif PlayerName == "Юкио Такэда" then 
        Name = "Yukio"
        elseif PlayerName == "Мишель Кайзер" or PlayerName == "Мишель Зантецу" then 
        Name = "Chiaki"
    	elseif PlayerName == "Ари" or PlayerName == "Аризу Канэко" then 
        Name = "Arizu"
    	elseif PlayerName == "Хесед" or PlayerName == "Даниель" then 
        Name = "Chesed"
    	elseif PlayerName == "Рамбл Тауэ" then 
        Name = "Ramble"
        elseif PlayerName == "Хано Хананокизу" then 
        Name = "Hano"
        elseif PlayerName == "Хару Такиби" then 
        Name = "Haru"
        elseif PlayerName == "Ки Дон Сон" then 
        Name = "Ki Don Son"
        elseif PlayerName == "Дори Мори" then 
        Name = "Dori"
        elseif PlayerName == "Леонье Солгейм" then 
        Name = "Leonija"
        elseif PlayerName == "Сан Хо Сон" then 
        Name = "San Ho Son"
        elseif PlayerName == "Теруми Тодо" then 
        Name = "Terumi"
        elseif PlayerName == "Хитоши Нацуно" then 
        Name = "Hitoshi"
        elseif PlayerName == "Китагава" then 
        Name = "Kitagawa"
        
		
else  Name = "Table"
				CountOfSprites = 0
			end
			local listSprites = file.Find("materials/"..Name.."/*.png","WORKSHOP")
			local listSprites2 = file.Find("materials/"..Name.."/*.vtf","WORKSHOP")
			CountOfSprites = math.max(#listSprites,#listSprites2)
    		if (Name == "Kazuichi" or Name == "Rock" or Name == "Ryoma") then
				CountOfSprites = CountOfSprites-1
			end
			return Name
end

local function StartTrial()

OpenImageBoard()
end
local function StartsdraTrial()

OpensdraImageBoard()
end

local countActive = false

local function StartTrialAnimation()
    countActive = true
	local Black = vgui.Create("DImage")
			Black:SetImage("materials/sprites/UI/Start/Back1.png")
			Black:SetAlpha(0)
			Black:SetSize(ScrW(), ScrH())
			Black:AlphaTo(255, 0.4, 0, function() 
				local Lines = vgui.Create("DImage", Black)
			Lines:SetImage("materials/sprites/UI/Start/Back.png")
			Lines:SetSize(ScrW(), ScrH())
			Lines:SetAlpha(0)
			Lines:AlphaTo(255, 0.3, 0, function() 
				local Lines1 = vgui.Create("DImage", Black)
				Lines1:SetAlpha(0)
                sound.PlayFile( "sound/starttrial.mp3", "", function( channel )
        channel:Play()
        channel:SetVolume( 1 )
        end)
			Lines1:SetImage("materials/sprites/UI/Start/Cla.png")
			Lines1:SetSize(ScrW(), ScrH())
			
			Lines1:AlphaTo(255, 0.2, 0, function()
				local Lines2 = vgui.Create("DImage", Black)
				Lines2:SetAlpha(0)
			Lines2:SetImage("materials/sprites/UI/Start/ss.png")
			Lines2:SetSize(ScrW(), ScrH())
			
			Lines2:AlphaTo(255, 0.2, 0, function() 
				local Lines3 = vgui.Create("DImage", Black)
				Lines3:SetAlpha(0)
				Lines3:SetImage("materials/sprites/UI/Start/Tri.png")
			Lines3:SetSize(ScrW(), ScrH())
			
			Lines3:AlphaTo(255, 0.1, 0, function()
				local Lines4 = vgui.Create("DImage", Black)
				Lines4:SetAlpha(0)
				Lines4:SetImage("materials/sprites/UI/Start/al.png")
				
			Lines4:SetSize(ScrW(), ScrH())
			Lines4:AlphaTo(255, 0.15, 0, function()
				Lines4:AlphaTo(255, 0.5, 0, function()
				local Lines5 = vgui.Create("DImage", Black)
				Lines5:SetAlpha(0)
				Lines5:SetImage("materials/sprites/UI/Start/Insession.png")
				
			Lines5:SetSize(ScrW(), ScrH())
			Lines5:AlphaTo(255, 0.45, 0, function()
				Lines5:AlphaTo(255, 1, 0, function()
				StartTrial()
				Lines5:SizeTo(ScrW()+1, ScrH()+1, 5)
				Black:MoveToFront()
					Black:AlphaTo(0, 2, 0, function() 
                        if(_panel!=nil) then
                            _panel:MakePopup()
                            _panel:SetKeyboardInputEnabled(false)
                            Black:Remove()
                        end
					end)
				end)
				end)
			end)
			end)
			end)
			end)
end)
end)
end)
end

net.Receive ("StartTrial", function()
        	playersTable = net.ReadTable()
			SpriteFolder = GetSpriteFolder(nil)
			StartTrialAnimation()
end)

function CloseTrial()
                    if _panel ~= nil then
                _panel:Remove()
            end
            if _button ~= nil then
_button:Remove()
end

if _obj ~= nil then
_obj:Remove()
end
if _objScnd ~= nil then
    _objScnd:Remove()
end
if _con ~= nil then
_con:Remove()
end
if _animbox ~= nil then
_animbox:Remove()
end
if _liv ~= nil then
    _liv:Remove()
    end
    timer.Simple(1.5, function ()
    if _UI ~= nil then
_UI:Remove()
end
end)
end

net.Receive("RestartTrial", function()
	CloseTrial()
	SpriteFolder = GetSpriteFolder(nil)
	StartTrial()
	end)

net.Receive("RestartsdraTrial", function()
	CloseTrial()
	SpriteFolder = GetSpriteFolder(nil)
	StartsdraTrial()
	end)

local _objection

local function AnimateArgue(lines, black, text, int)

	local count = int%2
    if(lines:IsValid()) then
	lines:SetImage("materials/sprites/UI/argue/ui/lines "..count..".png")
	black:SetImage("materials/sprites/UI/argue/ui/black "..count..".png")
	text:SetImage("materials/sprites/UI/argue/ui/text "..count..".png")

	timer.Simple(0.04, function ()
			AnimateArgue(lines, black, text, int+1)
		end)
	end
end

net.Receive("Objection2", function ()
        Angueclr = Color(0,0,0,200)
        MoveCameraclr = Color(0,0,0,200)
        objtrue = false
        timer.Simple(10, function()
                MoveCameraclr = Color(0,0,0,150)
        Angueclr = Color(0,0,0,100)
                objtrue = true
                end)
	local GetIt = net.ReadString()
	local Obj = vgui.Create("DImage")
	_objection = Obj
	surface.PlaySound("Irefuse2.mp3")
	Obj:SetSize(ScrW(), ScrH())
	local back = vgui.Create("DImage",Obj)
	back:SetSize(ScrW(), ScrH())
	back:SetImage("materials/sprites/UI/argue/ui/back.png")
	local lines = vgui.Create("DImage",Obj)
	lines:SetSize(ScrW(), ScrH())
	lines:SetImage("materials/sprites/UI/argue/ui/lines 1.png")
	local char = vgui.Create("DImage",Obj)
	char:SetSize(ScrW(), ScrH())
	char:SetImage("materials/sprites/UI/argue/character/"..GetIt..".png")
	local black = vgui.Create("DImage",Obj)
	black:SetSize(ScrW(), ScrH())
	black:SetImage("materials/sprites/UI/argue/ui/black 1.png")
	local text = vgui.Create("DImage",Obj)
	text:SetSize(ScrW(), ScrH())
	text:SetImage("materials/sprites/UI/argue/ui/text 1.png")
	Obj:SetPos(-ScrW()/3+200, ScrH())
	AnimateArgue(lines, black, text, 1)
	char:MoveTo(-25, -50, 2.5, 0, -1, function ()
		end)
	char:SizeTo(ScrW()+100, ScrH()+50, 2.5, 0, -1, function ()
		end)
	text:MoveTo(-125, -75, 2.5, 0, -1, function ()
		end)
	text:SizeTo(ScrW()+200, ScrH()+200, 2.5, 0, -1, function ()
		end)
	Obj:MoveTo(ScrW()/7-130, 0, 0.1,0,-1,function()
		timer.Simple(2, function ()
			local time = 0.2
			back:SizeTo(ScrW()*2, ScrH()*2, time, 0, -1, function ()
				end)
			lines:SizeTo(ScrW()*2, ScrH()*2, time, 0, -1, function ()
				end)
			black:SizeTo(ScrW()*2, ScrH()*2, time, 0, -1, function ()
				end)
			text:SizeTo(ScrW()*2, ScrH()*2, time, 0, -1, function ()
				end)
			char:SizeTo(ScrW()*2, ScrH()*2, time, 0, -1, function ()
				end)
			back:MoveTo(-ScrW()/2.75, -ScrH()/1.5, time, 0, -1, function ()
				end)
			lines:MoveTo(-ScrW()/2.75, -ScrH()/1.5, time, 0, -1, function ()
				end)
			black:MoveTo(-ScrW()/2.75, -ScrH()/1.5, time, 0, -1, function ()
				end)
			text:MoveTo(-ScrW()/2.75, -ScrH()/1.5, time, 0, -1, function ()
				end)
			char:MoveTo(-ScrW()/2.75, -ScrH()/1.5, time, 0, -1, function ()
				end)
			Obj:AlphaTo(0, time+1,0,function()
			Obj:Remove()
			end)
			back:AlphaTo(0, time,0,function()
				end)
			lines:AlphaTo(0, time,0,function()
				end)
			black:AlphaTo(0, time,0,function()
				end)
			text:AlphaTo(0, time,0,function()
				end)
			char:AlphaTo(0, time,0,function()
				end)
			end)
			
	end)
        
	end)
local function anim1()
	_objection:MoveTo(ScrW()/7, -10, 2,0,-1,anim2)
end
local function anim2()
	_objection:Remove()
end

Evidences = {}
local EvidencesHtml = {}
local EvidencesBigHtml = {}
local EvidencesIcons = {}

local function EvidencesFile()

end

net.Receive("PersonalEvidence", function()
    local tblEv = net.ReadTable()
    table.ForceInsert(Evidences, tblEv[1])
    table.ForceInsert(EvidencesHtml, tblEv[2])
    table.ForceInsert(EvidencesBigHtml, tblEv[3])
    table.ForceInsert(EvidencesIcons, tblEv[4])
    notification.AddLegacy( "В монопад добавлена новая улика", NOTIFY_GENERIC, 4 )
    surface.PlaySound( "buttons/button15.wav" )
end)

net.Receive("CleanEvidences", function()
Evidences = {}
EvidencesHtml = {}
EvidencesBigHtml = {}
EvidencesIcons = {}
BDAProbs = {}
timer.Simple(4, function()
file.Write( "Evidence/Evidences.txt", DDFChapter.."\n")
end)
end)



local function EndSDRA2TrialAnimation (Black)
	local Lines1 = vgui.Create("DImage", Black)
			Lines1:SetImage("materials/sprites/UI/End/BackEndSDRA21.png")
			Lines1:SetSize(ScrW(), ScrH())
				local Lines = vgui.Create("DImage", Black)
			Lines:SetImage("materials/sprites/UI/End/BackEndSDRA2.png")
			Lines:SetSize(ScrW(), ScrH())
			Lines:SetAlpha(0)
			Lines:AlphaTo(255, 0.3, 0, function()
			Lines:AlphaTo(255, 0.3, 0, function()  
				local Lines1 = vgui.Create("DImage", Black)
				Lines1:SetAlpha(0)
				Lines1:SetPos(ScrW()/4,ScrH()/18)
				surface.PlaySound("Endtrial.mp3")
			Lines1:SetImage("materials/sprites/UI/End/EndClassSDRA2.png")
			Lines1:SetSize(ScrW()/2, ScrH())
			Lines1:AlphaTo(255, 0.2, 0, function()
				Lines1:AlphaTo(255, 1, 0, function()
					
				Black:AlphaTo(0, 2, 0, function()
					Black:Remove()
					end)
				end)
			end)
			end)
			end)
end

local function EndTrialAnimation (Black)
    countActive = false
    hook.Remove("PlayerButtonDown", "hideWindowsOnSettings")
	local Lines = vgui.Create("DImage", Black)
			Lines:SetImage("materials/sprites/UI/End/Back.png")
			Lines:SetSize(ScrW(), ScrH())
			Lines:SetAlpha(0)
			Lines:AlphaTo(255, 0.3, 0, function()
			Lines:AlphaTo(255, 0.3, 0, function()  
				local Lines1 = vgui.Create("DImage", Black)
				Lines1:SetAlpha(0)
				surface.PlaySound("Endtrial.mp3")
			Lines1:SetImage("materials/sprites/UI/End/End.png")
			Lines1:SetSize(ScrW(), ScrH())
			Lines1:AlphaTo(255, 0.2, 0, function()
				Lines1:AlphaTo(255, 1, 0, function()
					
				Black:AlphaTo(0, 2, 0, function()
					Black:Remove()
					end)
				end)
			end)
			end)
			end)
end




net.Receive("EndTrial1", function()

	local Black = vgui.Create("DImage")
			Black:SetImage("materials/sprites/UI/Start/Back1.png")
			Black:SetAlpha(0)
			Black:SetSize(ScrW(), ScrH())
            CloseTrial()
			Black:AlphaTo(255, 0.4, 0, function() 

				EndTrialAnimation (Black)

	end)
			end)



net.Receive("EndsdraTrial1", function()

	local Black = vgui.Create("DImage")
			Black:SetImage("materials/sprites/UI/Start/Back1.png")
			Black:SetAlpha(0)
			Black:SetSize(ScrW(), ScrH())
			Black:AlphaTo(255, 0.4, 0, function() 
				CloseTrial()
				EndSDRA2TrialAnimation (Black)
	end)
			end)

net.Receive("GetEvidence1", function ()
	local tbl = net.ReadTable()
	local text = tbl[1]
	local bool = true
if (LocalPlayer():IsSuperAdmin()) then
	local ent = net.ReadEntity()
	local DFrame = vgui.Create("DFrame")
	DFrame.Paint = function (self,w,h)

end
	DFrame:SetSize( 400, 600)
	DFrame:Center()
	DFrame:SetTitle("")
	DFrame:MakePopup()
	local CImage = vgui.Create("DImage",DFrame)
	CImage:SetSize(400, 600)
	CImage:SetImage("materials/sprites/ui/world/evidencewohtml.png")
	
		local DTextEntry = vgui.Create( "DTextEntry", DFrame)
		DTextEntry:SetText( text )

		DTextEntry:SetPos( 5,5 )
		DTextEntry:SetSize( 390, 560 )
		DTextEntry:SetMultiline( true )
		local DButton = vgui.Create("DButton", DFrame)
		DButton:SetSize(390, 30)
		DButton:SetPos( 5, 570 )
		DButton:SetText("Сохранить")
		DButton.DoClick = function()
		net.Start("SetEvidence1")
		net.WriteString(DTextEntry:GetText())
		net.WriteEntity(ent)
		net.SendToServer()
		DFrame:Remove()
		end

	end
	if (!LocalPlayer():IsSuperAdmin()) then
		local ent = net.ReadEntity()
	local DFrame = vgui.Create("DFrame")
	DFrame.Paint = function (self,w,h)

end
	local CImage = vgui.Create("DImage",DFrame)
	CImage:SetSize(400, 600)
		DFrame:SetSize( 400, 600)
	DFrame:Center()
	DFrame:SetTitle("")
	DFrame:MakePopup()
	local htmlpath = tbl[2]
	if htmlpath == "" then
		CImage:SetImage("materials/sprites/ui/world/evidencewohtml.png")
	else
		CImage:SetImage("materials/sprites/ui/world/evidencewithhtml.png")
		local html = vgui.Create("DHTML",CImage)
	html:SetSize(400, 580)
	html:SetPos(0,198)
	local htmlcode = '<img src="'..htmlpath..'" width="384" height="385" />'
	html:SetHTML(htmlcode)
end
local bightmlpath = tbl[3]
if bightmlpath ~= "" then
	local FImage = vgui.Create("DImage",DFrame)
	DFrame:SetSize(800, 600)
	DFrame:SetPos(ScrW()/2-400,ScrH()/2-300)
	CImage:SetPos(400,0)
	FImage:SetSize(400, 600)
	FImage:SetImage("materials/sprites/ui/world/bightml.png")
	local html2 = vgui.Create("DHTML",FImage)
	html2:SetSize(410, 610)
	html2:SetPos(0,0)
	local bightmlcode = '<img src="'..bightmlpath..'" width="385" height="585" />'
	html2:SetHTML(bightmlcode)
end
	local CImage1 = vgui.Create("DImage",CImage)
	CImage1:SetSize(400, 600)
	CImage1:SetImage("materials/sprites/ui/world/exit.png")
	

	local CLabel = vgui.Create( "DLabel", CImage)
            CLabel:SetText(text)
            local enters = 0
	local i = 0
	while i ~= 500 do
		if text[i] == '\n' then
			enters = enters + 1
		end
		i = i + 1
	end
	CLabel:SetPos( 10, -285 + enters*6.5)
	CLabel:SetSize( 380, 600 )
	end
end)


net.Receive("GetEvidence", function ()
	local tbl = net.ReadTable()
	local text = net.ReadString()
	local bool = true
	for v,info in pairs(Evidences) do
		if info == text then 
			bool = false
			break
		end
	end
if bool == true then
    if text ~= "" then
        if(file.Exists("Evidence", "DATA")) then
            if(file.Exists("Evidence/Evidences.txt", "DATA")) then
                file.Append( "Evidence/Evidences.txt", "textevidence-begin" )
                file.Append( "Evidence/Evidences.txt", "\n" )
                file.Append( "Evidence/Evidences.txt", text )
                file.Append( "Evidence/Evidences.txt", "\n" )
                file.Append( "Evidence/Evidences.txt", "textevidence-end")
	            if(tbl[2]=="") then
	                file.Append( "Evidence/Evidences.txt", "\n" )
	            else
	                file.Append( "Evidence/Evidences.txt", "\n" )
	                file.Append( "Evidence/Evidences.txt", tbl[2] .. "\n")
	            end
	            if(tbl[3]=="") then
	                file.Append( "Evidence/Evidences.txt", "\n" )
	            else
	                file.Append( "Evidence/Evidences.txt", "\n" )
	                file.Append( "Evidence/Evidences.txt", tbl[3] .. "\n")
	            end
	            file.Append( "Evidence/Evidences.txt", "\n" )
	            file.Append( "Evidence/Evidences.txt", tbl[4])
	            file.Append( "Evidence/Evidences.txt", "\n" )
        	else
	            local f = file.Open( "Evidence/Evidences.txt", "a", "DATA" )
	            f:Close()
	            if(file.Exists("Evidence/Evidences.txt", "DATA")) then
	            	file.Append( "Evidence/Evidences.txt", DDFChapter.."\n" )
	                file.Append( "Evidence/Evidences.txt", "textevidence-begin" )
	                file.Append( "Evidence/Evidences.txt", "\n" )
	                file.Append( "Evidence/Evidences.txt", text )
	                file.Append( "Evidence/Evidences.txt", "\n" )
	                file.Append( "Evidence/Evidences.txt", "textevidence-end")
		            if(tbl[2]=="") then
		                file.Append( "Evidence/Evidences.txt", "\n" )
		            else
		                file.Append( "Evidence/Evidences.txt", "\n" )
		                file.Append( "Evidence/Evidences.txt", tbl[2] .. "\n")
		            end
		            if(tbl[3]=="") then
		                file.Append( "Evidence/Evidences.txt", "\n" )
		            else
		                file.Append( "Evidence/Evidences.txt", "\n" )
		                file.Append( "Evidence/Evidences.txt", tbl[3] .. "\n")
		            end
		            file.Append( "Evidence/Evidences.txt", "\n" )
		            file.Append( "Evidence/Evidences.txt", tbl[4])
		            file.Append( "Evidence/Evidences.txt", "\n" )
        		end
        	end
    else
        file.CreateDir("Evidence")
        local f = file.Open( "Evidence/Evidences.txt", "a", "DATA" )
        f:Close()
        		file.Append( "Evidence/Evidences.txt", DDFChapter.."\n" )
        		file.Append( "Evidence/Evidences.txt", "textevidence-begin" )
                file.Append( "Evidence/Evidences.txt", "\n" )
                file.Append( "Evidence/Evidences.txt", text )
                file.Append( "Evidence/Evidences.txt", "\n" )
                file.Append( "Evidence/Evidences.txt", "textevidence-end")
	            if(tbl[2]=="") then
	                file.Append( "Evidence/Evidences.txt", "\n" )
	            else
	                file.Append( "Evidence/Evidences.txt", "\n" )
	                file.Append( "Evidence/Evidences.txt", tbl[2] .. "\n")
	            end
	            if(tbl[3]=="") then
	                file.Append( "Evidence/Evidences.txt", "\n" )
	            else
	                file.Append( "Evidence/Evidences.txt", "\n" )
	                file.Append( "Evidence/Evidences.txt", tbl[3] .. "\n")
	            end
	            file.Append( "Evidence/Evidences.txt", "\n" )
	            file.Append("Evidence/Evidences.txt", tbl[4])
	            file.Append( "Evidence/Evidences.txt", "\n" )
    end
    table.ForceInsert(Evidences, text)
    table.ForceInsert(EvidencesHtml, tbl[2])
    table.ForceInsert(EvidencesBigHtml, tbl[3])
    table.ForceInsert(EvidencesIcons, tbl[4])
end
end
if (LocalPlayer():IsSuperAdmin()) then
	local ent = net.ReadEntity()
	local DFrame = vgui.Create("DFrame")
	DFrame.Paint = function (self,w,h)
end
	DFrame:SetSize( 400, 600)
	DFrame:Center()
	DFrame:SetTitle("")
	DFrame:MakePopup()
	local CImage = vgui.Create("DImage",DFrame)
	CImage:SetSize(400, 600)
	CImage:SetImage("materials/sprites/ui/world/evidencewohtml.png")
	
		local DTextEntry = vgui.Create( "DTextEntry", DFrame)
		DTextEntry:SetText( text )

		DTextEntry:SetPos( 5,5 )
		DTextEntry:SetSize( 390, 560 )
		DTextEntry:SetMultiline( true )
		local DButton = vgui.Create("DButton", DFrame)
		DButton:SetSize(390, 30)
		DButton:SetPos( 5, 570 )
		DButton:SetText("Сохранить")
		DButton.DoClick = function()
		net.Start("SetEvidence")
		net.WriteString(DTextEntry:GetText())
		net.WriteEntity(ent)
		net.SendToServer()
		DFrame:Remove()
		end

	end
	if (!LocalPlayer():IsSuperAdmin()) then
		local ent = net.ReadEntity()
	local DFrame = vgui.Create("DFrame")
	DFrame.Paint = function (self,w,h)
end
	local CImage = vgui.Create("DImage",DFrame)
	CImage:SetSize(400, 600)
		DFrame:SetSize( 400, 600)
	DFrame:Center()
	DFrame:SetTitle("")
	DFrame:MakePopup()

		CImage:SetImage("materials/sprites/ui/world/evidencewohtml.png")
	
	local CImage1 = vgui.Create("DImage",CImage)
	CImage1:SetSize(400, 600)
	CImage1:SetImage("materials/sprites/ui/world/exit.png")
	

	local CLabel = vgui.Create( "DLabel", CImage)
            CLabel:SetText(text)
            local enters = 0
	local i = 0
	while i ~= 500 do
		if text[i] == '\n' then
			enters = enters + 1
		end
		i = i + 1
	end
	CLabel:SetPos( 10, -285 + enters*6.5)
	CLabel:SetSize( 380, 600 )
	end
end)

net.Receive("GetEvidenceSlots", function()
	local tbl = net.ReadTable()
	local text = net.ReadString()
	table.ForceInsert(EvidencesHtml, tbl[2])
    table.ForceInsert(EvidencesBigHtml, tbl[3])
	table.ForceInsert(EvidencesIcons, tbl[4])
	if(file.Exists("Evidence", "DATA")) then
            if(file.Exists("Evidence/Evidences.txt", "DATA")) then
                file.Append( "Evidence/Evidences.txt", "textevidence-begin" )
                file.Append( "Evidence/Evidences.txt", "\n" )
                file.Append( "Evidence/Evidences.txt", text )
                file.Append( "Evidence/Evidences.txt", "\n" )
                file.Append( "Evidence/Evidences.txt", "textevidence-end")
	            if(tbl[2]=="") then
	                file.Append( "Evidence/Evidences.txt", "\n" )
	            else
	                file.Append( "Evidence/Evidences.txt", "\n" )
	                file.Append( "Evidence/Evidences.txt", tbl[2] .. "\n")
	            end
	            if(tbl[3]=="") then
	                file.Append( "Evidence/Evidences.txt", "\n" )
	            else
	                file.Append( "Evidence/Evidences.txt", "\n" )
	                file.Append( "Evidence/Evidences.txt", tbl[3] .. "\n")
	            end
	            file.Append( "Evidence/Evidences.txt", "\n" )
	            file.Append( "Evidence/Evidences.txt", tbl[4])
	            file.Append( "Evidence/Evidences.txt", "\n" )
        	else
	            local f = file.Open( "Evidence/Evidences.txt", "a", "DATA" )
	            f:Close()
	            if(file.Exists("Evidence/Evidences.txt", "DATA")) then
	            	file.Append( "Evidence/Evidences.txt", DDFChapter.."\n" )
	                file.Append( "Evidence/Evidences.txt", "textevidence-begin" )
	                file.Append( "Evidence/Evidences.txt", "\n" )
	                file.Append( "Evidence/Evidences.txt", text )
	                file.Append( "Evidence/Evidences.txt", "\n" )
	                file.Append( "Evidence/Evidences.txt", "textevidence-end")
		            if(tbl[2]=="") then
		                file.Append( "Evidence/Evidences.txt", "\n" )
		            else
		                file.Append( "Evidence/Evidences.txt", "\n" )
		                file.Append( "Evidence/Evidences.txt", tbl[2] .. "\n")
		            end
		            if(tbl[3]=="") then
		                file.Append( "Evidence/Evidences.txt", "\n" )
		            else
		                file.Append( "Evidence/Evidences.txt", "\n" )
		                file.Append( "Evidence/Evidences.txt", tbl[3] .. "\n")
		            end
		            file.Append( "Evidence/Evidences.txt", "\n" )
		            file.Append( "Evidence/Evidences.txt", tbl[4])
		            file.Append( "Evidence/Evidences.txt", "\n" )
        		end
        	end
    else
        file.CreateDir("Evidence")
        local f = file.Open( "Evidence/Evidences.txt", "a", "DATA" )
        f:Close()
        		file.Append( "Evidence/Evidences.txt", DDFChapter.."\n" )
        		file.Append( "Evidence/Evidences.txt", "textevidence-begin" )
                file.Append( "Evidence/Evidences.txt", "\n" )
                file.Append( "Evidence/Evidences.txt", text )
                file.Append( "Evidence/Evidences.txt", "\n" )
                file.Append( "Evidence/Evidences.txt", "textevidence-end")
	            if(tbl[2]=="") then
	                file.Append( "Evidence/Evidences.txt", "\n" )
	            else
	                file.Append( "Evidence/Evidences.txt", "\n" )
	                file.Append( "Evidence/Evidences.txt", tbl[2] .. "\n")
	            end
	            if(tbl[3]=="") then
	                file.Append( "Evidence/Evidences.txt", "\n" )
	            else
	                file.Append( "Evidence/Evidences.txt", "\n" )
	                file.Append( "Evidence/Evidences.txt", tbl[3] .. "\n")
	            end
	            file.Append( "Evidence/Evidences.txt", "\n" )
	            file.Append("Evidence/Evidences.txt", tbl[4])
	            file.Append( "Evidence/Evidences.txt", "\n" )
    end
end)

local _KFrame
local function OpenLabelForSingleTrial()
local KFrame = vgui.Create("DFrame")
_KFrame = KFrame
KFrame:SetPos(ScrW()*3/8,ScrH()*4/9)
KFrame:MakePopup()
KFrame:SetTitle("Введите имя человека")
KFrame:SetSize(600,75)
local KTextEntry = vgui.Create("DTextEntry", KFrame)
KTextEntry:SetPos(5, 25)
KTextEntry:SetSize(590, 20)
local KButton = vgui.Create("DButton", KFrame)
KButton:SetText("Начать суд")
KButton:SetPos(5, 50)
KButton:SetSize(190, 20)
KButton.DoClick = function()
	local sr = false
for i,ply1 in pairs(player.GetAll()) do
	if ply1:GetName() == KTextEntry:GetText() then
net.Start("StartSingleTrial")
net.WriteString(KTextEntry:GetText())
net.SendToServer()
sr = true
	end
end
	if sr == false then
	LocalPlayer():PrintMessage(HUD_PRINTTALK, "Ошибка: Персонаж с таким именем не найден")
end
end
local KButton2 = vgui.Create("DButton", KFrame)
KButton2:SetText("Закончить суд")
KButton2:SetPos(205, 50)
KButton2:SetSize(190, 20)
KButton2.DoClick = function()
	local sr = false
for i,ply1 in pairs(player.GetAll()) do
	if ply1:GetName() == KTextEntry:GetText() then
net.Start("EndSingleTrial")
net.WriteString(KTextEntry:GetText())
net.SendToServer()
sr = true
	end
end
	if sr == false then
	LocalPlayer():PrintMessage(HUD_PRINTTALK, "Ошибка: Персонаж с таким именем не найден")
end
end
local KButton3 = vgui.Create("DButton", KFrame)
KButton3:SetText("Перезапустить суд")
KButton3:SetPos(405, 50)
KButton3:SetSize(190, 20)
KButton3.DoClick = function()
	local sr = false
for i,ply1 in pairs(player.GetAll()) do
	if ply1:GetName() == KTextEntry:GetText() then
net.Start("RestartTrial")
net.WriteString(KTextEntry:GetText())
net.SendToServer()
sr = true
	end
end
	if sr == false then
	LocalPlayer():PrintMessage(HUD_PRINTTALK, "Ошибка: Персонаж с таким именем не найден")
end
end
end
local function OpenLabelForSinglesdraTrial()
local KFrame = vgui.Create("DComboBox")
_KFrame = KFrame
KFrame:SetPos(ScrW()*3/8,ScrH()*4/9)
KFrame:MakePopup()
KFrame:SetValue("Выберите человека")
KFrame:SetSize(600,75)
local KTextEntry = vgui.Create("DTextEntry", KFrame)
KTextEntry:SetPos(5, 25)
KTextEntry:SetSize(590, 20)
local KButton = vgui.Create("DButton", KFrame)
KButton:SetText("Начать суд")
KButton:SetPos(5, 50)
KButton:SetSize(190, 20)
KButton.DoClick = function()
	local sr = false
for i,ply1 in pairs(player.GetAll()) do
	if ply1:GetName() == KTextEntry:GetText() then
net.Start("StartSinglesdraTrial")
net.WriteString(KTextEntry:GetText())
net.SendToServer()
sr = true
	end
end
	if sr == false then
	LocalPlayer():PrintMessage(HUD_PRINTTALK, "Ошибка: Персонаж с таким именем не найден")
end
end
local KButton2 = vgui.Create("DButton", KFrame)
KButton2:SetText("Закончить суд")
KButton2:SetPos(205, 50)
KButton2:SetSize(190, 20)
KButton2.DoClick = function()
	local sr = false
for i,ply1 in pairs(player.GetAll()) do
	if ply1:GetName() == KTextEntry:GetText() then
net.Start("EndSinglesdraTrial")
net.WriteString(KTextEntry:GetText())
net.SendToServer()
sr = true
	end
end
	if sr == false then
	LocalPlayer():PrintMessage(HUD_PRINTTALK, "Ошибка: Персонаж с таким именем не найден")
end
end
local KButton3 = vgui.Create("DButton", KFrame)
KButton3:SetText("Перезапустить суд")
KButton3:SetPos(405, 50)
KButton3:SetSize(190, 20)
KButton3.DoClick = function()
	local sr = false
for i,ply1 in pairs(player.GetAll()) do
	if ply1:GetName() == KTextEntry:GetText() then
net.Start("RestartsdraTrial")
net.WriteString(KTextEntry:GetText())
net.SendToServer()
sr = true
	end
end
	if sr == false then
	LocalPlayer():PrintMessage(HUD_PRINTTALK, "Ошибка: Персонаж с таким именем не найден")
end
end
end




local rightbool = false
local _rightUI = nil
local single5 = true
local _moneyLabel = nil
if rightbool == true then
	_rightUI:Remove()
end
rightbool = !rightbool

single5 = false
timer.Simple(0.1, function ()
	single5 = true
	end)
local daylenght = 3600
local Noise
local i = 0
local _NFrame = nil
local function OpenMoneyTransaction()
    if _NFrame ~= nil then 
			_NFrame:Remove()
		end
local NFrame = vgui.Create("DFrame")
_NFrame = NFrame
NFrame:SetPos(ScrW()*3/8,ScrH()*4/9)
NFrame:MakePopup()
NFrame:SetTitle("Перевод мономонет")
NFrame:SetSize(500,100)
local NTextEntry = vgui.Create("DComboBox", NFrame)
    NTextEntry:SetValue("Выберите человека, которому хотите отправить мономонеты")
NTextEntry:SetPos(5, 25)
NTextEntry:SetSize(490, 20)
    for k,v in ipairs(player.GetAll()) do
        if v ~= LocalPlayer() then
        NTextEntry:AddChoice(v:Nick())
            end
            end            
local STextEntry = vgui.Create("DTextEntry", NFrame)
    STextEntry:SetPlaceholderText("Введите количество мономонет")
STextEntry:SetPos(5, 50)
STextEntry:SetSize(490, 20)
local NButton = vgui.Create("DButton", NFrame)
NButton:SetText("Отправить")
NButton:SetPos(5, 75)
NButton:SetSize(490, 20)
NButton.DoClick = function()
if tonumber(STextEntry:GetText()) > 0 then
if tonumber(STextEntry:GetText()) <= monocoins then
	local sr = false
for i,ply1 in pairs(player.GetAll()) do
	if ply1:GetName() == NTextEntry:GetValue() then
net.Start("SendMonokoins")
net.WriteString(NTextEntry:GetValue())
net.WriteFloat(STextEntry:GetText())
local mc = STextEntry:GetText() * -1
monocoins = LocalPlayer():GetNWInt("Monocoins") + mc
_moneyLabel:SetText(monocoins)
net.SendToServer()
NFrame:Remove()
sr = true
	end
end
	if sr == false then
	LocalPlayer():PrintMessage(HUD_PRINTTALK, "Ошибка: Персонаж с таким именем не найден")
end
	else
 LocalPlayer():PrintMessage(HUD_PRINTTALK, "Ошибка: У вас недостаточно мономонет для данной операции")
end	
	else
 LocalPlayer():PrintMessage(HUD_PRINTTALK, "Ошибка: Чисто отправляемых мономонет не должно быть отрицательным")
end	
	end	

    end

net.Receive("GetMonokoinsFromAnotherPlayer", function()
	local nm = net.ReadString()
local mc = net.ReadFloat()
monocoins = LocalPlayer():GetNWInt("Monocoins")
LocalPlayer():PrintMessage(HUD_PRINTTALK, "Вы только что получили ".. mc .. " мономонет от " .. nm)
	end)

function StartNoise(Noise)

        Noise:SizeTo(ScrW(),ScrH(), 0.1, 0, 1, function ()
        Noise:SetImage("materials/sprites/whitenoise/".. i .. ".png")
        if (i == 5) then
        i = 0
        else
            i = i+1
        end
        StartNoise(Noise)
        end)
    end
    local single1 = true

    net.Receive("BDA3", function()
        if single1 == true then
    		surface.PlaySound("announsments/BDA.mp3")
    		single1 = false
    		timer.Simple(1, function ()
        		single1 = true
        	end)
		end
    end)

    local function StartStartNoise()
        surface.PlaySound("announsments/BDAnoise.mp3")
    	local Noise = vgui.Create("DImage")
    	timer.Simple(10, function ()
        	Noise:Remove()
        end)
    	StartNoise(Noise)
    	Noise:SetSize(ScrW(), ScrH())
    	Noise:SetAlpha(0)
    	Noise:SetImage("materials/sprites/whitenoise/0.png")
    	Noise:AlphaTo(50, 1, 0, function()
        	Noise:AlphaTo(25, 1, 0, function()
            	Noise:AlphaTo(50, 1, 0, function()
                    Noise:AlphaTo(25, 1, 0, function()
                        Noise:AlphaTo(100, 2, 0, function()
                        	Noise:AlphaTo(0, 4, 0, function()
                            	yes = false
                                Noise:Remove()

        					end)
        				end)
        			end)
        		end)
        	end)
        end)        
    end




		hook.Add("Think", "hz", function ()
			if (!LocalPlayer():IsSuperAdmin()) then
			local eyetrace = LocalPlayer():GetEyeTrace()
			if (eyetrace.Entity:GetClass()!=nil and eyetrace.Entity:GetClass() == "prop_ragdoll" and eyetrace.Entity:GetNWBool("IsVictim") == true and eyetrace.Entity:GetNWString("KillerName") ~= LocalPlayer():Nick()) then
			if (LocalPlayer():GetUserGroup() ~= "spectator") then
            if (LocalPlayer():Alive()) then
            if (LocalPlayer():GetMoveType() ~= MOVETYPE_NOCLIP) then
                local IsBDASeen = false
                local BDAProbsSize = 0
                for k,v in pairs(BDAProbs) do
            		if v == eyetrace.Entity then
                		IsBDASeen = true
            		end
            		BDAProbsSize = k
            	end
        		if IsBDASeen == false then
            		BDAProbs[BDAProbsSize+1] = eyetrace.Entity
                		if (eyetrace.Entity:GetNWFloat("BDACount") == nil) then
                    		eyetrace.Entity:SetNWFloat("BDACount", 1)
                		else
                			eyetrace.Entity:SetNWFloat("BDACount", eyetrace.Entity:GetNWFloat("BDACount") + 1)
                		end
                        net.Start("BDAProp")
                		net.WriteEntity(eyetrace.Entity)
                		net.WriteFloat(eyetrace.Entity:GetNWFloat("BDACount"))
                		net.SendToServer()
                		StartStartNoise()
                		if eyetrace.Entity:GetNWFloat("BDACount") == 3 then
						net.Start("BDA4")
						net.SendToServer()
            			end
				end
			end
			end
    		end
        	end	
			end
    	end)


net.Receive("GetMonocoins", function ()
	count = net.ReadFloat()
	monocoins = monocoins + count
	LocalPlayer():PrintMessage(HUD_PRINTTALK, "Вы получили - ".. count .. " мономонет")
	end)


net.Receive("GetKillerName", function ()
    if LocalPlayer():IsSuperAdmin() then
local table = net.ReadTable()
local NFrame = vgui.Create("DFrame")
NFrame:Center()
NFrame:MakePopup()
NFrame:SetTitle("Выбери убийцу из списка")
NFrame:SetSize(300,75)
local NTextEntry = vgui.Create("DComboBox", NFrame)
NTextEntry:SetValue("Выберите убийцу")
NTextEntry:SetPos(5, 25)
NTextEntry:SetSize(290, 20)
local i = nil
for k,v in ipairs(player.GetAll()) do
    NTextEntry:AddChoice(v:Nick())
    if v:Nick() == table[1] then
    	NTextEntry:SetValue(v:Nick())
    end
end   
--[[if i ~= nil then
	NTextEntry:ChoseOptionID(i)
end --]]
--local NTextEntry = vgui.Create("DTextEntry", NFrame)
--NTextEntry:SetText(table[1])
--NTextEntry:SetPos(5, 25)
--NTextEntry:SetSize(290, 20)
local NButton = vgui.Create("DButton", NFrame)
NButton:SetText("Сохранить")
NButton:SetPos(5, 50)
NButton:SetSize(290, 20)
NButton.DoClick = function()
net.Start("SetKillerName1")
net.WriteTable({NTextEntry:GetText(),table[2]})
net.SendToServer()
NFrame:Remove()
end

end
	end)

	local RuleW = 1200
    local RuleH = 800 
    surface.CreateFont( "MonopadTime", {
    font = "Arial", 
    extended = false,
    size = 40,
    weight = 500,
    blursize = 0,
    scanlines = 0,
    antialias = true,
    underline = false,
    italic = false,
    strikeout = false,
    symbol = false,
    rotary = false,
    shadow = false,
    additive = false,
    outline = false,
} )

	singl4 = true
	

net.Receive("SetRules", function ()
    rules = net.ReadTable()
    end)

local evIn = true
net.Receive("EvidenceInitialize", function()
    if(evIn) then
        timer.Simple(2, function()
            if(file.Exists("Evidence", "DATA")) then
                if(file.Exists("Evidence/Evidences.txt", "DATA")) then
                    local timeFile = file.Open( "Evidence/Time.txt", "a", "DATA" )
                    timeFile:Close()
                    local timeFiles = file.Time( "Evidence/Time.txt", "DATA" ) - file.Time( "Evidence/Evidences.txt", "DATA" )
                    file.Delete( "Evidence/Time.txt" )
                    local value = file.Open( "Evidence/Evidences.txt", "r","DATA" )
                    local textFile = ""
                    local newString = string.gsub(value:ReadLine(),"\n","")
                    if (DDFChapter<=newString and timeFiles<14400) then
                        while !value:EndOfFile() do
                            local ar = value:ReadLine()
                            if ar == "textevidence-begin\n" then
                                textFile = ""
                            end
                            if ar == "textevidence-end\n" then
                                table.ForceInsert(Evidences, textFile)
                                local qr = value:ReadLine()
                                if qr == "\n" then
                                    qr = ""
                                end
                                table.ForceInsert(EvidencesHtml, qr)
                                qr = value:ReadLine()
                                if qr == "\n" then
                                    qr = ""
                                end
                                table.ForceInsert(EvidencesBigHtml, qr)
                                qr = string.gsub(value:ReadLine(),"\n","")
                                table.ForceInsert(EvidencesIcons, qr)
                            elseif ar != "textevidence-begin\n" then
                                textFile = textFile .. ar
                            end
                        end
                    else
                        file.Write( "Evidence/Evidences.txt", DDFChapter.."\n")
                    end
                    value:Close()
                else
                    local f = file.Open( "Evidence/Evidences.txt", "a", "DATA" )
                    f:Close()
                    file.Append( "Evidence/Evidences.txt", DDFChapter.."\n" )
                end
            else
                file.CreateDir("Evidence")
                local f = file.Open( "Evidence/Evidences.txt", "a", "DATA" )
                f:Close()
                file.Append( "Evidence/Evidences.txt", DDFChapter.."\n" )
            end
            evIn = false
        end)
    end
end)

--Новый монопад--

local ButtonTables ={}

surface.CreateFont( "TimeFont", {
	font = "CloseCaption_Bold",
	size = (ScrH()+ScrW())/50,
	weight = 700,
	shadow = true,
	extended = true,
} )

surface.CreateFont( "MoneyFont", {
	font = "CloseCaption_Bold",
	size = (ScrH()+ScrW())/130,
	weight = 400,
	shadow = true,
	extended = true,
} )

surface.CreateFont( "EvidenceFont", {
	font = "CloseCaption_Bold",
	size = (ScrH()+ScrW())/100,
	weight = 400,
	shadow = true,
	extended = true,
} )

surface.CreateFont( "MainTextEvidenceFont", {
	font = "CloseCaption_Bold",
	size = (ScrH()+ScrW())/130,
	weight = 400,
	shadow = true,
	extended = true,
} )

local alarms = {{},{},{}}

--surface.PlaySound( "buttons/button8.wav" )

--surface.PlaySound( "alarm.mp3" )
--[[local function AlarmSound()
for i = 1, 180 do
	timer.Simple(i/100, function()
		--surface.PlaySound( "buttons/button15.wav" )
		--surface.PlaySound( "alarm.mp3" )
end)
end
end--]]

--AlarmSound()
hook.Add("Think", "alarms", function()
	local time = math.floor(CurTime()) + 1200
	while time > daylenght do
		time = time - daylenght
	end
	local hour = math.floor(time / 150)
	local minute = math.floor((time - hour * 150)/150*60)
	local title = ""

		for i = 1, table.Count(alarms[1]) do
		if (tonumber(alarms[1][i]) == hour and tonumber(alarms[2][i]) == minute) then
				if (alarms[3][i] ~= nil and alarms[3][i] ~= "" and alarms[3][i] ~= "TestDisctriptionForNoDescription") then
					title = ' Описание: "'..alarms[3][i]..'"'
				end
			if minute < 10 then
			notification.AddLegacy( "Ваш будильник на ["..hour..":0"..minute.."] сработал."..title, NOTIFY_GENERIC, 5 )
		else
			notification.AddLegacy( "Ваш будильник на ["..hour..":"..minute.."] сработал."..title, NOTIFY_GENERIC, 5 )
		end
			--surface.PlaySound( "buttons/button15.wav" )
			surface.PlaySound( "alarm.mp3" )
			--AlarmSound()
			table.remove(alarms[1],i)
			table.remove(alarms[2],i)
			table.remove(alarms[3],i)
		end
	end
end)

local function timeMonoNow(LabelTime,ImageDN)
	local time = math.floor(CurTime()) + 1200
	while time > daylenght do
		time = time - daylenght
	end
	local hour = math.floor(time / 150)
	local minute = math.floor((time - hour * 150)/150*60)
	if(LabelTime:IsValid()) then
		if minute < 10 then
			LabelTime:SetText( hour .. ":0" .. minute )
		else
			LabelTime:SetText( hour .. ":" .. minute )
		end
	end
	if (hour >= 22 or hour <8) then
        ImageDN:SetImage("sprites/ui/MonoPad/NightTime.png")
    else
    	ImageDN:SetImage("sprites/ui/MonoPad/DayTime.png")
    end
end



trueButtonMonopad = true
local chatTrueButton = false

local monopadName = ""
net.Receive("ChoiceMonopad3", function(len,ply)
	monopadName = net.ReadString()
end)
local singleMonopad = true
local bodyFrame = nil
function OpenMonopad()
		if singleMonopad then
			singleMonopad = false
			timer.Simple(0.5, function()
				singleMonopad = true
		end)
		trueButtonMonopad = false
			--net.Start('TalkIconChat')
			--net.WriteBool(!trueButtonMonopad)
		--net.SendToServer()
        if bodyFrame == nil then
		bodyFrame = vgui.Create( "DFrame" )
		bodyFrame:SetSize( ScrW()/1.2, ScrH()/1.2)
		bodyFrame:CenterHorizontal()
		bodyFrame:SetPos(bodyFrame:GetX(), ScrH())
		bodyFrame:MakePopup()
		bodyFrame:SetTitle("")
		bodyFrame:ShowCloseButton(false)
		bodyFrame:SetScreenLock(false)
		bodyFrame:SetDraggable(false)
		function CLoseMonopad()
			timer.Stop("GameTimer")
				bodyFrame:Close()
                bodyFrame = nil
				if LocalPlayer():GetActiveWeapon():GetClass() == "monopad" then
					timer.Simple(0.125, function()
					--LocalPlayer():GetActiveWeapon().WorldModel = "models/ddf/monopad_world2.mdl"
					net.Start("CloseMonopad2")
					net.WriteEntity(LocalPlayer())
					net.SendToServer()
				end)
					net.Start("CloseMonopad")
					net.SendToServer()
				end
				timer.Simple( 1, function() 
					trueButtonMonopad = true 
									
				end )
		end
		--[[function bodyFrame:OnKeyCodePressed(...)
			if (... == 23) then
				CLoseMonopad()
			end
		end--]]

		local bodyImage = vgui.Create("DImage", bodyFrame)
		bodyImage:SetSize(bodyFrame:GetSize())		
		bodyImage:SetImage("sprites/ui/MonoPad/Body.png")

		local MainScreenImage = vgui.Create("DImage", bodyFrame)
		MainScreenImage:SetSize(bodyFrame:GetWide()/1.045,bodyFrame:GetTall()/1.15)
		MainScreenImage:Center()
		MainScreenImage:SetPos(MainScreenImage:GetX(),MainScreenImage:GetY()*0.35)	
		MainScreenImage:SetImage("sprites/ui/MonoPad/MainScreen.png")

		local OffButton = vgui.Create("DImageButton", bodyFrame)
		local buttonSize = bodyFrame:GetTall()/20
		OffButton:SetSize(buttonSize,buttonSize)
		OffButton:SetText("")
		OffButton:SetImage("talkicon1/offButton2.png")
		OffButton:SetPos(bodyFrame:GetWide()/2-buttonSize/5*3.45,bodyFrame:GetTall()/20*18.25)
		OffButton.DoClick = function()
		CLoseMonopad()
	end
	            --OffButton.Paint = function()
                --end

		local DayNightImage = vgui.Create("DImage", bodyFrame)
		DayNightImage:SetSize(bodyFrame:GetWide()/1.00005,bodyFrame:GetTall()/1.02)
		DayNightImage:Center()
		DayNightImage:SetPos(DayNightImage:GetX(),DayNightImage:GetY()*0.35)	
		DayNightImage:SetImage("sprites/ui/MonoPad/MainScreen.png")

		local blackScreenImage = vgui.Create("DImage", bodyFrame)
		blackScreenImage:SetSize(bodyFrame:GetWide()/1.045,bodyFrame:GetTall()/1.15)
		blackScreenImage:Center()
		blackScreenImage:SetPos(blackScreenImage:GetX(),blackScreenImage:GetY()*0.35)	
		blackScreenImage:SetImage("sprites/ui/MonoPad/Black.png")

		local timeLabel = MainScreenImage:Add("DLabel")
		timeLabel:SetSize(MainScreenImage:GetWide()/1.45,MainScreenImage:GetTall()/1.45)
		timeLabel:SetPos(MainScreenImage:GetWide()/1.135,MainScreenImage:GetTall()/1.65)
		timeLabel:SetTextColor(Color(255,255,255))
		timeLabel:SetFont("TimeFont")
		timeMonoNow(timeLabel,DayNightImage)
		timer.Create( "GameTimer", 1, 0, function() 
			timeMonoNow(timeLabel,DayNightImage)
		end)
		local _addAlarmButton = nil
		local _AlFrame = nil
		local function OpenAlarmLabel()
			if _AlFrame ~= nil then 
				_AlFrame:Remove()
			end
			local AlFrame = bodyFrame:Add("DFrame")
			_AlFrame = AlFrame
			AlFrame:SetSize(MainScreenImage:GetWide()/6.5,75)
			AlFrame:SetPos(_addAlarmButton:GetX()+bodyFrame:GetX(), _addAlarmButton:GetY()+bodyFrame:GetY()-70)
			AlFrame:MakePopup()
			AlFrame:SetTitle("Добавить будильник")
			AlFrame:SetDraggable(false)
			local HourTextEntry = vgui.Create("DTextEntry", AlFrame)
    		HourTextEntry:SetPlaceholderText("10")
			HourTextEntry:SetPos(5, 25)
			HourTextEntry:SetSize(30, 20)
			local AlarmTextLabel = vgui.Create("DLabel", AlFrame)
			AlarmTextLabel:SetPos(37.5,25)
			AlarmTextLabel:SetSize(30, 20)
			AlarmTextLabel:SetText(":")
			local MinuteTextEntry = vgui.Create("DTextEntry", AlFrame)
    		MinuteTextEntry:SetPlaceholderText("10")
			MinuteTextEntry:SetPos(40, 25)
			MinuteTextEntry:SetSize(30, 20)      
			local STextEntry = vgui.Create("DTextEntry", AlFrame)
    		STextEntry:SetPlaceholderText("Описание (опционально)")
			STextEntry:SetPos(75, 25)
			STextEntry:SetSize(AlFrame:GetWide()-80, 20)
			local NButton = vgui.Create("DButton", AlFrame)
			NButton:SetText("Добавить будильник")
			NButton:SetPos(5, 50)
			NButton:SetSize(AlFrame:GetWide()-10, 20)
			NButton.DoClick = function()
			table.insert(alarms[1], HourTextEntry:GetText())
			table.insert(alarms[2], MinuteTextEntry:GetText())
			table.insert(alarms[3], STextEntry:GetText())
			AlFrame:Remove()
			end
		end
		local addAlarmButton = bodyFrame:Add("DButton")
		_addAlarmButton = addAlarmButton
        addAlarmButton:SetSize(MainScreenImage:GetWide()/6.5,MainScreenImage:GetTall()/10)
		addAlarmButton:SetPos(MainScreenImage:GetWide()/40*34.8,MainScreenImage:GetTall()/15*14)
            addAlarmButton:MoveToFront()
            addAlarmButton:SetText("")
            addAlarmButton.Paint = function()
                end
            addAlarmButton.DoClick = function()
            OpenAlarmLabel()
                end

        
        monocoins = LocalPlayer():GetNWInt("Monocoins")
		local moneyLabel = MainScreenImage:Add("DLabel")
            _moneyLabel = moneyLabel
		moneyLabel:SetSize(MainScreenImage:GetWide()/1.45,MainScreenImage:GetTall()/1.45)
		moneyLabel:SetPos(MainScreenImage:GetWide()/1.14,MainScreenImage:GetTall()-MainScreenImage:GetTall()/0.87)
		moneyLabel:SetTextColor(Color(255,255,255))
		moneyLabel:SetFont("MoneyFont")
		moneyLabel:SetText(monocoins)


		local heightButton = ScrH()/2.5

            local rulesButton = bodyFrame:Add("DImage")
		local rulesButtonButton = bodyFrame:Add("DButton")
            rulesButtonButton:SetPos(ScrW()/80 + ScrW()/18, ScrH()/2.5)
            rulesButtonButton:SetSize(ScrW()/9, ScrH()/5)
            rulesButtonButton.Paint = function()
                end
            rulesButtonButton:SetText("")
		rulesButton:SetPos(ScrW()/80, ScrH()/2.5)
		rulesButton:SetSize(ScrW()/4.5, ScrH()/3.5)
		rulesButton:SetImage( "sprites/ui/MonoPad/MonoButton.png" )
		rulesButton:SetAlpha(0)
		rulesButton:SetMouseInputEnabled(false)
		rulesButtonButton.OnCursorEntered = function()
			surface.PlaySound("charactermenu/Pick.mp3")
			rulesButton:MoveTo(rulesButton:GetX(),heightButton-50,0.1,0,-1,function()
				rulesButton:SetImage("sprites/ui/MonoPad/MonoButtonLight.png")
			end)
		end
		rulesButtonButton.OnCursorExited = function()
			rulesButton:MoveTo(rulesButton:GetX(),heightButton,0.1,0,-1,function()
				rulesButton:SetImage("sprites/ui/MonoPad/MonoButton.png")
			end)
		end

		local rulesIcon = rulesButton:Add("DImage")
		rulesIcon:SetSize(rulesButton:GetWide()/4,rulesButton:GetWide()/4)
		rulesIcon:SetImage("sprites/ui/MonoPad/rulesIcon.png")
		rulesIcon:Center()
		rulesIcon:SetPos(rulesIcon:GetX(),rulesIcon:GetY()/1.2)

		local notesButton = bodyFrame:Add("DImage")
            local notesButtonButton = bodyFrame:Add("DButton")
            notesButtonButton:SetPos(ScrW()/7 + ScrW()/18, ScrH()/2.5)
            notesButtonButton:SetSize(ScrW()/9, ScrH()/5)
            notesButtonButton.Paint = function()
                end
            notesButtonButton:SetText("")
		notesButton:SetPos(ScrW()/7, ScrH()/2.5)
		notesButton:SetSize(ScrW()/4.5, ScrH()/3.5)
		notesButton:SetImage( "sprites/ui/MonoPad/MonoButton.png" )
		notesButton:SetAlpha(0)
		notesButton:SetMouseInputEnabled(false)
		notesButtonButton.OnCursorEntered = function()
			surface.PlaySound("charactermenu/Pick.mp3")
			notesButton:MoveTo(notesButton:GetX(),heightButton-50,0.1,0,-1,function()
				notesButton:SetImage("sprites/ui/MonoPad/MonoButtonLight.png")
			end)
		end
		notesButtonButton.OnCursorExited = function()
			notesButton:MoveTo(notesButton:GetX(),heightButton,0.1,0,-1,function()
				notesButton:SetImage("sprites/ui/MonoPad/MonoButton.png")
			end)
		end

		local notesIcon = notesButton:Add("DImage")
		notesIcon:SetSize(notesButton:GetWide()/4,notesButton:GetWide()/4)
		notesIcon:SetImage("sprites/ui/MonoPad/notesIcon.png")
		notesIcon:Center()
		notesIcon:SetPos(notesIcon:GetX(),notesIcon:GetY()/1.2)

		local evidenceButton = bodyFrame:Add("DImage")
            local evidenceButtonButton = bodyFrame:Add("DButton")
            evidenceButtonButton:SetPos(ScrW()/3.65 + ScrW()/18, ScrH()/2.5)
            evidenceButtonButton:SetSize(ScrW()/9, ScrH()/5)
            evidenceButtonButton.Paint = function()
                end
            evidenceButtonButton:SetText("")
		evidenceButton:SetPos(ScrW()/3.65, ScrH()/2.5)
		evidenceButton:SetSize(ScrW()/4.5, ScrH()/3.5)
		evidenceButton:SetImage( "sprites/ui/MonoPad/MonoButton.png" )
		evidenceButton:SetAlpha(0)
		evidenceButton:SetMouseInputEnabled(false)
		evidenceButtonButton.OnCursorEntered = function()
			surface.PlaySound("charactermenu/Pick.mp3")
			evidenceButton:MoveTo(evidenceButton:GetX(),heightButton-50,0.1,0,-1,function()
				evidenceButton:SetImage("sprites/ui/MonoPad/MonoButtonLight.png")
			end)
		end
		evidenceButtonButton.OnCursorExited = function()
			evidenceButton:MoveTo(evidenceButton:GetX(),heightButton,0.1,0,-1,function()
				evidenceButton:SetImage("sprites/ui/MonoPad/MonoButton.png")
			end)
		end

		local evidenceIcon = evidenceButton:Add("DImage")
		evidenceIcon:SetSize(evidenceButton:GetWide()/4,evidenceButton:GetWide()/4)
		evidenceIcon:SetImage("sprites/ui/MonoPad/evidenceIcon.png")
		evidenceIcon:Center()
		evidenceIcon:SetPos(evidenceIcon:GetX(),evidenceIcon:GetY()/1.2)
		rulesButtonButton:MoveToFront()
            notesButtonButton:MoveToFront()

            		local chatButton = bodyFrame:Add("DImage")
            local chatButtonButton = bodyFrame:Add("DButton")
            chatButtonButton:SetPos(ScrW()/2.45 + ScrW()/18, ScrH()/2.5)
            chatButtonButton:SetSize(ScrW()/9, ScrH()/5)
            chatButtonButton.Paint = function()
                end
            chatButtonButton:SetText("")
		chatButton:SetPos(ScrW()/2.45, ScrH()/2.5)
		chatButton:SetSize(ScrW()/4.5, ScrH()/3.5)
		chatButton:SetImage( "sprites/ui/MonoPad/MonoButton.png" )
		chatButton:SetAlpha(0)
		chatButton:SetMouseInputEnabled(false)
		chatButtonButton.OnCursorEntered = function()
			surface.PlaySound("charactermenu/Pick.mp3")
			chatButton:MoveTo(chatButton:GetX(),heightButton-50,0.1,0,-1,function()
				chatButton:SetImage("sprites/ui/MonoPad/MonoButtonLight.png")
			end)
		end
		chatButtonButton.OnCursorExited = function()
			chatButton:MoveTo(chatButton:GetX(),heightButton,0.1,0,-1,function()
				chatButton:SetImage("sprites/ui/MonoPad/MonoButton.png")
			end)
		end

		local chatIcon = chatButton:Add("DImage")
		chatIcon:SetSize(chatButton:GetWide()/4,chatButton:GetWide()/4)
		chatIcon:SetImage("sprites/ui/MonoPad/chatIcon.png")
		chatIcon:Center()
		chatIcon:SetPos(chatIcon:GetX(),chatIcon:GetY()/1.2)
		rulesButtonButton:MoveToFront()
            notesButtonButton:MoveToFront()
            evidenceButtonButton:MoveToFront()
           
        local moneyLabelButton = bodyFrame:Add("DButton")
        moneyLabelButton:SetSize(MainScreenImage:GetWide()/10,MainScreenImage:GetTall()/10)
		moneyLabelButton:SetPos(MainScreenImage:GetWide()/40*34.8,MainScreenImage:GetTall()/7)
            moneyLabelButton:MoveToFront()
            moneyLabelButton:SetText("")
            moneyLabelButton.Paint = function()
                end
            moneyLabelButton.DoClick = function()
            OpenMoneyTransaction()
                end
            
		rulesButtonButton.DoClick = function()
			surface.PlaySound("charactermenu/Chose.mp3")
			rulesButton:SetMouseInputEnabled(false)
			notesButton:SetMouseInputEnabled(false)
			evidenceButton:SetMouseInputEnabled(false)
			chatButton:SetMouseInputEnabled(false)
			local rulesFrame = bodyFrame:Add("DFrame")
			rulesFrame:SetSize(bodyFrame:GetWide()/1.233,bodyFrame:GetTall()/1.3)
			rulesFrame:SetPos(bodyFrame:GetX()*1.22,bodyFrame:GetY()*2.05)
			rulesFrame:MakePopup()
			rulesFrame:SetTitle("")
			rulesFrame:ShowCloseButton(false)
			rulesFrame:SetScreenLock(false)
			rulesFrame:SetDraggable(false)
			rulesFrame:SetAlpha(0)
			local closeButton = rulesFrame:Add("DImageButton")
            closeButton:SetSize(rulesFrame:GetWide()/21,rulesFrame:GetTall()/20)
            closeButton:SetPos(rulesFrame:GetX()*6.32, rulesFrame:GetY()/20)
            closeButton:SetImage("sprites/ui/MonoPad/CloseButton.png")
            closeButton.DoClick = function()
            	rulesFrame:MoveTo(rulesFrame:GetX(),ScrH()+5,0.2,0,-1,function()
            		rulesButton:SetMouseInputEnabled(true)
					notesButton:SetMouseInputEnabled(true)
					evidenceButton:SetMouseInputEnabled(true)
					chatButton:SetMouseInputEnabled(true)
					rulesFrame:AlphaTo(50, 0.2,0,function()
            			rulesFrame:Remove()
            			bodyFrame:SetMouseInputEnabled(true)
            		end)
            	end)
            end
			local hideRulesImage = vgui.Create("DImage", rulesFrame)
			hideRulesImage:SetSize(rulesFrame:GetSize())
			hideRulesImage:SetImage("sprites/ui/MonoPad/RulesWindow.png")
			rulesButton:MoveTo(rulesButton:GetX(),heightButton,0.1,0,-1,function()
				rulesButton:SetImage("sprites/ui/MonoPad/MonoButton.png")
			end)

			local rulesHorizontalList = rulesFrame:Add("DHorizontalScroller")
			rulesHorizontalList:SetSize(rulesFrame:GetWide(),rulesFrame:GetTall()/1.2)
			rulesHorizontalList:SetPos(rulesFrame:GetX()/20,rulesFrame:GetY()/2)
			rulesHorizontalList:SetOverlap( -4 )

			local rulesList = rulesHorizontalList:Add("DScrollPanel")
			rulesList:SetSize(rulesHorizontalList:GetWide(),rulesHorizontalList:GetTall())
			rulesHorizontalList:AddPanel(rulesList)

			local ki = 0
			local h =0 
			local w = 0
			for k,v in ipairs(rules) do
				if(k==1) then
					local DLabel = rulesFrame:Add("DLabel")
					DLabel:SetPos( rulesFrame:GetX()/2, rulesFrame:GetY()/8+h)
					DLabel:SetSize(rulesFrame:GetWide(), rulesFrame:GetTall()/10)
					DLabel:SetTextColor(Color(255,255,255))
					DLabel:SetFont("TimeFont")
					DLabel:SetText( rules[1] )
				end
				if (k>1 and v~="") then
					ki = ki+1
					h=h+rulesFrame:GetY()/7
					local DLabel = rulesList:Add("DLabelEditable")
					DLabel:SetPos( rulesFrame:GetX()/2, rulesFrame:GetY()/4+h)
					DLabel:SetSize(1, rulesFrame:GetTall()/16)
					DLabel:SetText( ki .. ". " .. v )
					DLabel:SizeToContents()
					if(DLabel:GetWide()>w) then
						w = DLabel:GetWide()
					end
				end
        	end
        	if(w>rulesList:GetWide()) then
        		rulesList:SetSize(w*1.1,rulesList:GetTall())
        	end
			rulesHorizontalList:SetScroll(1)
			rulesFrame:AlphaTo(255, 0.2,0)
			bodyFrame:SetMouseInputEnabled(false)
		end

		notesButtonButton.DoClick = function()
			surface.PlaySound("charactermenu/Chose.mp3")
			rulesButton:SetMouseInputEnabled(false)
			notesButton:SetMouseInputEnabled(false)
			evidenceButton:SetMouseInputEnabled(false)
			chatButton:SetMouseInputEnabled(false)

			local numberNote = -1

			local notesFrame = bodyFrame:Add("DFrame")
			notesFrame:SetSize(bodyFrame:GetWide()/1.233,bodyFrame:GetTall()/1.3)
			notesFrame:SetPos(bodyFrame:GetX()*1.22,bodyFrame:GetY()*2.05)
			notesFrame:MakePopup()
			notesFrame:SetTitle("")
			notesFrame:ShowCloseButton(false)
			notesFrame:SetScreenLock(false)
			notesFrame:SetDraggable(false)
			notesFrame:SetAlpha(0)


			local hideNotesImage = vgui.Create("DImage", notesFrame)
			hideNotesImage:SetSize(notesFrame:GetSize())
			hideNotesImage:SetImage("sprites/ui/MonoPad/RulesWindow.png")
			notesButton:MoveTo(notesButton:GetX(),heightButton,0.1,0,-1,function()
				notesButton:SetImage("sprites/ui/MonoPad/MonoButton.png")
			end)

			local DLabel = notesFrame:Add("DLabel")
			DLabel:SetPos( notesFrame:GetX()/6,notesFrame:GetY()/10)
			DLabel:SetSize(notesFrame:GetWide()/4,notesFrame:GetTall()/8)
			DLabel:SetTextColor(Color(255,255,255))
			DLabel:SetFont("TimeFont")
			DLabel:SetText( "Заметки" )

			local writeFrame = notesFrame:Add("DFrame")
			writeFrame:SetPos(notesFrame:GetX()/8,notesFrame:GetY()/1.92)
			writeFrame:ShowCloseButton(false)
            writeFrame:SetTitle("")
            writeFrame:SetSize(notesFrame:GetWide()/2,notesFrame:GetTall()*0.855)
            writeFrame:SetVerticalScrollbarEnabled(true)
            writeFrame:SetPaintBorderEnabled(false)
            writeFrame:SetDraggable(false)
            writeFrame.Paint = function()
                surface.SetDrawColor(140,140,140,255)
                surface.DrawRect(0, 0, writeFrame:GetWide()/1.05, writeFrame:GetTall()/1.038)
            end

            local maxNotes = 1

            local scrollNotesFrame = notesFrame:Add("DFrame")
			scrollNotesFrame:SetPos(notesFrame:GetX()*3.4,notesFrame:GetY()/1.92)
			scrollNotesFrame:ShowCloseButton(false)
            scrollNotesFrame:SetTitle("")
            scrollNotesFrame:SetSize(notesFrame:GetWide()/2,notesFrame:GetTall()*0.855)
            scrollNotesFrame:SetVerticalScrollbarEnabled(true)
            scrollNotesFrame:SetPaintBorderEnabled(false)
            scrollNotesFrame:SetDraggable(false)
            scrollNotesFrame.Paint = function()
                surface.SetDrawColor(140,140,140,255)
                surface.DrawRect(0, 0, scrollNotesFrame:GetWide()/1.05, scrollNotesFrame:GetTall()/1.038)
                surface.SetDrawColor(255, 255, 255,255)
                surface.DrawRect(writeFrame:GetX()/2, writeFrame:GetY()/18, scrollNotesFrame:GetWide()/1.09, scrollNotesFrame:GetTall()/1.15)
            end

            ButtonNow = {}
            local TitleText = writeFrame:Add("DTextEntry")
			TitleText:SetPos(writeFrame:GetX()/2,writeFrame:GetY()/20)
			TitleText:SetSize(writeFrame:GetWide()/1.08,writeFrame:GetTall()/25)
			TitleText.OnTextChanged = function(PanelVar)
				if (numberNote != -1) then
					ButtonTables[numberNote].name = TitleText:GetText()
				end
				if (ButtonNow[1] != nil) then
					ButtonNow[1]:SetText(TitleText:GetText())
				end
			end
		
			local MainText = writeFrame:Add("DTextEntry")
			MainText:SetPos(writeFrame:GetX()/2,writeFrame:GetY()/4)
			MainText:SetSize(writeFrame:GetWide()/1.08,writeFrame:GetTall()/1.2)
			MainText:SetMultiline(true)
			MainText:SetVerticalScrollbarEnabled(true)
			MainText.OnTextChanged = function(PanelVar)
				if (numberNote != -1) then
					ButtonTables[numberNote].text = MainText:GetText()
				end
			end

			local addNoteButton = writeFrame:Add("DImageButton")
			addNoteButton:SetPos(writeFrame:GetX()/2,writeFrame:GetY()*4.57)
			addNoteButton:SetSize(writeFrame:GetWide()/1.08,writeFrame:GetTall()/12.5)
			addNoteButton:SetImage("sprites/ui/MonoPad/AddNoteButton.png")

			local delNoteButton = scrollNotesFrame:Add("DImageButton")
			delNoteButton:SetPos(writeFrame:GetX()/2,writeFrame:GetY()*4.57)
			delNoteButton:SetSize(scrollNotesFrame:GetWide()/1.08,writeFrame:GetTall()/12.5)
			delNoteButton:SetImage("sprites/ui/MonoPad/DelNoteButton.png")
			local n
			delNoteButton.DoClick = function()
				for k,v in pairs(ButtonTables) do
					if(ButtonNow[1]:GetText() == v.name) then
						n=k
					end
				end
				table.remove(ButtonTables,n)
				maxNotes = maxNotes-1
				ButtonNow[1]:Remove()
				numberNote = -1
			end

			local notesList = scrollNotesFrame:Add("DScrollPanel")
			notesList:SetPos(writeFrame:GetX()/2, writeFrame:GetY()/4)
			notesList:SetSize(scrollNotesFrame:GetWide()/1.12,scrollNotesFrame:GetTall()/2.2)

			addNoteButton.DoClick = function()
				local newNote = notesList:Add( "DButton" )
				newNote:SetText(TitleText:GetText())
				newNote:Dock( TOP )
				newNote:DockMargin( 0, 0, 0, 5 )
				local title = TitleText:GetText()
				local main = MainText:GetText()
				local numAN = maxNotes
				ButtonTables[maxNotes]={name=TitleText:GetText(),text = MainText:GetText()}
				newNote.DoClick = function()
					TitleText:SetText(ButtonTables[numAN].name)
					MainText:SetText(ButtonTables[numAN].text)
					ButtonNow[1] = newNote
					numberNote = numAN
				end
				maxNotes = maxNotes+1
			end

			for k,v in pairs(ButtonTables) do
				local noteButton = notesList:Add( "DButton" )
				noteButton:SetText( v.name )
				noteButton:Dock( TOP )
				noteButton:DockMargin( 0, 0, 0, 5 )
				noteButton.DoClick = function()
					TitleText:SetText(v.name)
					MainText:SetText(v.text)
					ButtonNow[1] = noteButton
					numberNote = k
				end
				maxNotes = k+1
			end

			local closeButton = notesFrame:Add("DImageButton")
            closeButton:SetSize(bodyFrame:GetWide()/26,bodyFrame:GetTall()/26)
            closeButton:SetPos(bodyFrame:GetX()*7.7, bodyFrame:GetY()/9.5)
            closeButton:SetImage("sprites/ui/MonoPad/CloseButton.png")
            closeButton.DoClick = function()
            	writeFrame:MoveTo(notesFrame:GetX(),ScrH()+5,0.2,0,-1)
            	scrollNotesFrame:MoveTo(notesFrame:GetX(),ScrH()+5,0.2,0,-1)
            	notesFrame:MoveTo(notesFrame:GetX(),ScrH()+5,0.2,0,-1,function()
            		rulesButton:SetMouseInputEnabled(true)
					notesButton:SetMouseInputEnabled(true)
					evidenceButton:SetMouseInputEnabled(true)
					chatButton:SetMouseInputEnabled(true)
					notesFrame:AlphaTo(50, 0.2,0,function()
            			notesFrame:Remove()
            			bodyFrame:SetMouseInputEnabled(true)
            		end)
            	end)
            end

			notesFrame:AlphaTo(255, 0.2,0)
			bodyFrame:SetMouseInputEnabled(false)
		end
		
		evidenceButtonButton.DoClick = function()
			surface.PlaySound("charactermenu/Chose.mp3")
			rulesButton:SetMouseInputEnabled(false)
			notesButton:SetMouseInputEnabled(false)
			evidenceButton:SetMouseInputEnabled(false)
			chatButton:SetMouseInputEnabled(false)
			local evidenceFrame = bodyFrame:Add("DFrame")
			evidenceFrame:SetSize(bodyFrame:GetWide()/1.233,bodyFrame:GetTall()/1.3)
			evidenceFrame:SetPos(bodyFrame:GetX()*1.22,bodyFrame:GetY()*2.05)
			evidenceFrame:MakePopup()
			evidenceFrame:SetTitle("")
			evidenceFrame:ShowCloseButton(false)
			evidenceFrame:SetScreenLock(false)
			evidenceFrame:SetDraggable(false)
			evidenceFrame:SetAlpha(0)
			local hideRulesImage = vgui.Create("DImage", evidenceFrame)
			hideRulesImage:SetSize(evidenceFrame:GetSize())
			hideRulesImage:SetImage("sprites/ui/MonoPad/RulesWindow.png")
			evidenceButton:MoveTo(evidenceButton:GetX(),heightButton,0.1,0,-1,function()
				evidenceButton:SetImage("sprites/ui/MonoPad/MonoButton.png")
			end)
			
			local DLabel = evidenceFrame:Add("DLabel")
			DLabel:SetPos( evidenceFrame:GetX()/4,evidenceFrame:GetY()/10)
			DLabel:SetSize(evidenceFrame:GetWide()/4,evidenceFrame:GetTall()/8)
			DLabel:SetTextColor(Color(255,255,255))
			DLabel:SetFont("TimeFont")
			DLabel:SetText( "Улики" )

			local evidenceListFrame = evidenceFrame:Add("DFrame")
			evidenceListFrame:SetPos(evidenceFrame:GetX()/4,evidenceFrame:GetY()/1.92)
			evidenceListFrame:ShowCloseButton(false)
            evidenceListFrame:SetTitle("")
            evidenceListFrame:SetSize(evidenceFrame:GetWide()/2.99,evidenceFrame:GetTall()*0.82)
            evidenceListFrame:SetVerticalScrollbarEnabled(true)
            evidenceListFrame:SetPaintBorderEnabled(false)
            evidenceListFrame:SetDraggable(false)

            local evidenceListImage = vgui.Create("DImage", evidenceListFrame)
			evidenceListImage:SetSize(evidenceFrame:GetSize())
			evidenceListImage:SetImage("sprites/ui/MonoPad/EvidenceList.png")

			local evidenceList = evidenceListFrame:Add("DScrollPanel")
			evidenceList:SetPos(evidenceListFrame:GetX()/2, evidenceListFrame:GetY()/4)
			evidenceList:SetSize(evidenceListFrame:GetWide()/1.12,ScrH()/2.2)

			local sbar = evidenceList:GetVBar()
			function sbar:Paint(w, h)
				draw.RoundedBox(0, 0, 0, w, h, Color(255, 255, 255, 100))
			end
			function sbar.btnUp:Paint(w, h)
				draw.RoundedBox(0, 0, 0, w, h, Color(255, 255, 255))
			end
			function sbar.btnDown:Paint(w, h)
				draw.RoundedBox(0, 0, 0, w, h, Color(255, 255, 255))
			end
			function sbar.btnGrip:Paint(w, h)
				draw.RoundedBox(0, 0, 0, w, h, Color(255, 255, 255))
			end
			
			local evidenceTextFrame = evidenceFrame:Add("DFrame")
			evidenceTextFrame:SetPos(evidenceFrame:GetX()*2.6,evidenceFrame:GetY()/1.92)
			evidenceTextFrame:ShowCloseButton(false)
            evidenceTextFrame:SetTitle("")
            evidenceTextFrame:SetSize(evidenceFrame:GetWide()/1.73,evidenceFrame:GetTall()*0.82)
            evidenceTextFrame:SetVerticalScrollbarEnabled(true)
            evidenceTextFrame:SetPaintBorderEnabled(false)
            evidenceTextFrame:SetDraggable(false)

            local evidenceTextImage = vgui.Create("DImage", evidenceTextFrame)
			evidenceTextImage:SetSize(evidenceTextFrame:GetSize())
			evidenceTextImage:SetImage("sprites/ui/MonoPad/EvidenceText.png")

			local evidenceTitleImage = evidenceTextFrame:Add("DImage")
			evidenceTitleImage:SetSize(evidenceTextFrame:GetWide()/1.14,evidenceTextFrame:GetTall()/10)
			evidenceTitleImage:SetPos(evidenceTextFrame:GetX()/12,evidenceTextFrame:GetY()/3)
			evidenceTitleImage:SetImage("sprites/ui/MonoPad/EvidenceTitle.png")

			local titleEvidenceText = evidenceTextFrame:Add("DLabel")
			titleEvidenceText:SetFont("EvidenceFont")
			titleEvidenceText:SetText("")
			titleEvidenceText:SetPos(evidenceTextFrame:GetX()/8,evidenceTextFrame:GetY()/3)
			titleEvidenceText:SetSize(evidenceTextFrame:GetWide()/1.14,evidenceTextFrame:GetTall()/10)

			local iconEvidence = evidenceTextFrame:Add("DImage")
			iconEvidence:SetSize(evidenceTextFrame:GetWide()/7,evidenceTextFrame:GetTall()/7)
			iconEvidence:SetPos(evidenceTextFrame:GetX()/8, evidenceTextFrame:GetY()/1.2)
			iconEvidence:SetImage("materials/sprites/ui/EvidenceIcons/Binder.png")

			local mainTextEvidence = evidenceTextFrame:Add("DTextEntry")
			mainTextEvidence:SetPos(evidenceTextFrame:GetX()/3, evidenceTextFrame:GetY()/1.2)
			mainTextEvidence:SetSize(evidenceTextFrame:GetWide()/1.45,evidenceTextFrame:GetTall()/1.4)
			mainTextEvidence:SetValue("")
			mainTextEvidence:SetFont("MainTextEvidenceFont")
			mainTextEvidence:SetMultiline(true)
			mainTextEvidence:SetPaintBackground(false)
			mainTextEvidence:SetTextColor(Color(255,255,255))
			mainTextEvidence:SetEditable(false)

			for i=1, 100 do
				local DImageButton = evidenceList:Add( "DImageButton" )
				DImageButton:SetText( "Button #" .. i )
				DImageButton:Dock( TOP )
				DImageButton:SetSize(DImageButton:GetWide(), evidenceList:GetTall()/7.5)
				DImageButton:SetImage("sprites/ui/MonoPad/evidenceButton.png")
				DImageButton:DockMargin( 0, 0, 0, 5 )
				DImageButton.DoClick = function()
					if(Evidences[i]!=nil) then
						titleEvidenceText:SetText(string.sub(Evidences[i], 1, string.find(Evidences[i],"\n")-1))
						if(EvidencesIcons[i]==nil) then
							iconEvidence:SetImage("materials/sprites/ui/EvidenceIcons/Binder.png")
						else
							iconEvidence:SetImage(EvidencesIcons[i])
						end
						mainTextEvidence:SetValue(string.sub(Evidences[i], string.find(Evidences[i],"\n"), string.len(Evidences[i])))
					end
				end
				local titleEvidence = DImageButton:Add("DLabel")
				titleEvidence:SetPos(evidenceList:GetX(),evidenceList:GetY()/2.7)
				titleEvidence:SetSize(DImageButton:GetWide()*6,DImageButton:GetTall()/1.5)
				titleEvidence:SetFont("EvidenceFont")
				if (Evidences[i] != nil) then
					titleEvidence:SetText(string.sub(Evidences[i], 1, string.find(Evidences[i],"\n")-1))
				else
					titleEvidence:SetText("")
				end
			end
			
			local closeButton = evidenceFrame:Add("DImageButton")
            closeButton:SetSize(bodyFrame:GetWide()/26,bodyFrame:GetTall()/26)
            closeButton:SetPos(bodyFrame:GetX()*7.7, bodyFrame:GetY()/9.5)
            closeButton:SetImage("sprites/ui/MonoPad/CloseButton.png")
            closeButton.DoClick = function()
            	evidenceTextFrame:MoveTo(evidenceFrame:GetX(),ScrH()+5,0.2,0,-1)
            	evidenceListFrame:MoveTo(evidenceFrame:GetX(),ScrH()+5,0.2,0,-1)
            	evidenceFrame:MoveTo(evidenceFrame:GetX(),ScrH()+5,0.2,0,-1,function()
            		rulesButton:SetMouseInputEnabled(true)
					notesButton:SetMouseInputEnabled(true)
					evidenceButton:SetMouseInputEnabled(true)
					chatButton:SetMouseInputEnabled(true)
					evidenceFrame:AlphaTo(50, 0.2,0,function()
            			evidenceFrame:Remove()
            			bodyFrame:SetMouseInputEnabled(true)
            		end)
            	end)
            end

			evidenceFrame:AlphaTo(255, 0.2,0)
			bodyFrame:SetMouseInputEnabled(false)
		end

		chatButtonButton.DoClick = function()
			net.Start("GetChats1")
			net.SendToServer()
		end
		net.Receive("GetChats2", function()
			local chatListTable = net.ReadTable()
			--print(chatListTable[1]["id"])
			--print(chatList["id"][1]["Messages"]["Character"][2])
			surface.PlaySound("charactermenu/Chose.mp3")
			rulesButton:SetMouseInputEnabled(false)
			notesButton:SetMouseInputEnabled(false)
			evidenceButton:SetMouseInputEnabled(false)
			chatButton:SetMouseInputEnabled(false)

			local notesFrame = bodyFrame:Add("DFrame")
			notesFrame:SetSize(bodyFrame:GetWide()/1.233,bodyFrame:GetTall()/1.3)
			notesFrame:SetPos(bodyFrame:GetX()*1.22,bodyFrame:GetY()*2.05)
			notesFrame:MakePopup()
			notesFrame:SetTitle("")
			notesFrame:ShowCloseButton(false)
			notesFrame:SetScreenLock(false)
			notesFrame:SetDraggable(false)
			notesFrame:SetAlpha(0)


			local hideNotesImage = vgui.Create("DImage", notesFrame)
			hideNotesImage:SetSize(notesFrame:GetSize())
			hideNotesImage:SetImage("sprites/ui/MonoPad/RulesWindow.png")
			notesButton:MoveTo(notesButton:GetX(),heightButton,0.1,0,-1,function()
				notesButton:SetImage("sprites/ui/MonoPad/MonoButton.png")
			end)

			local DLabel = notesFrame:Add("DLabel")
			DLabel:SetPos( notesFrame:GetX()/6,notesFrame:GetY()/10)
			DLabel:SetSize(notesFrame:GetWide()/4,notesFrame:GetTall()/8)
			DLabel:SetTextColor(Color(255,255,255))
			DLabel:SetFont("TimeFont")
			DLabel:SetText( "Чат" )

			local writeFrame = notesFrame:Add("DFrame")
			writeFrame:SetPos(notesFrame:GetX()/8,notesFrame:GetY()/1.92)
			writeFrame:ShowCloseButton(false)
            writeFrame:SetTitle("")
            writeFrame:SetSize(notesFrame:GetWide()/4,notesFrame:GetTall()*0.855)
            writeFrame:SetVerticalScrollbarEnabled(true)
            writeFrame:SetPaintBorderEnabled(false)
            writeFrame:SetDraggable(false)
            writeFrame.Paint = function()
                surface.SetDrawColor(140,140,140,255)
                surface.DrawRect(0, 0, writeFrame:GetWide()/1.05, writeFrame:GetTall()/1.038)
                surface.SetDrawColor(255, 255, 255,255)
                surface.DrawRect(writeFrame:GetX()/8, writeFrame:GetY()/20, writeFrame:GetWide()/1.075, writeFrame:GetTall()/1.11)
            end

            local maxNotes = 1

            local scrollNotesFrame = notesFrame:Add("DFrame")
			scrollNotesFrame:SetPos(notesFrame:GetX()*1.75,notesFrame:GetY()/1.92)
			scrollNotesFrame:ShowCloseButton(false)
            scrollNotesFrame:SetTitle("")
            scrollNotesFrame:SetSize(notesFrame:GetWide()/4*3,notesFrame:GetTall()*0.855)
            scrollNotesFrame:SetVerticalScrollbarEnabled(true)
            scrollNotesFrame:SetPaintBorderEnabled(false)
            scrollNotesFrame:SetDraggable(false)
            scrollNotesFrame.Paint = function()
                surface.SetDrawColor(140,140,140,255)
                surface.DrawRect(0, 0, scrollNotesFrame:GetWide()/1.05, scrollNotesFrame:GetTall()/1.038)
                surface.SetDrawColor(255, 255, 255,255)
                surface.DrawRect(writeFrame:GetX()/8, writeFrame:GetY()/20, scrollNotesFrame:GetWide()/1.06, scrollNotesFrame:GetTall()/1.11)
            end

            ButtonNow = {}
            --[[local TitleText = writeFrame:Add("DTextEntry")
			TitleText:SetPos(writeFrame:GetX()/2,writeFrame:GetY()/20)
			TitleText:SetSize(writeFrame:GetWide()/1.08,writeFrame:GetTall()/25)
			
			local MainText = writeFrame:Add("DTextEntry")
			MainText:SetPos(writeFrame:GetX()/2,writeFrame:GetY()/4)
			MainText:SetSize(writeFrame:GetWide()/1.08,writeFrame:GetTall()/1.2)
			MainText:SetMultiline(true)
			MainText:SetVerticalScrollbarEnabled(true)--]]
			local сhatList = writeFrame:Add("DScrollPanel")
			сhatList:SetPos(writeFrame:GetX()/4, writeFrame:GetY()/12)
			сhatList:SetSize(writeFrame:GetWide()/1.1,writeFrame:GetTall()/1.11)
			
			chatTrueButton = true

			local addNoteButton = writeFrame:Add("DButton")
			addNoteButton:SetPos(writeFrame:GetX()/8,writeFrame:GetY()*4.7)
			addNoteButton:SetSize(writeFrame:GetWide()/1.2,writeFrame:GetTall()/22.5)
			addNoteButton:SetText("Создать чат")
			--addNoteButton:SetImage("sprites/ui/MonoPad/AddNoteButton.png")
			local announcementButton = writeFrame:Add("DButton")
			announcementButton:SetPos(addNoteButton:GetX()+addNoteButton:GetWide(),addNoteButton:GetY())
			announcementButton:SetSize(writeFrame:GetWide()/10,writeFrame:GetTall()/22.5)
			announcementButton:SetImage("sprites/ui/EvidenceIcons/alarmclock.png")
			announcementButton:SetText("")
			announcementButton:SetTooltip("Звук оповещения о новых сообщений: включён")

			local printLetterInput = scrollNotesFrame:Add("DTextEntry")
			printLetterInput:SetPos(writeFrame:GetX()/8,writeFrame:GetY()*4.7)
			printLetterInput:SetSize(scrollNotesFrame:GetWide()/1.09,writeFrame:GetTall()/22.5)
			printLetterInput:SetEnabled( false )


			local showMoreFrame = nil

			local showMoreButton = scrollNotesFrame:Add("DButton")
			showMoreButton:SetPos(writeFrame:GetX()/8+scrollNotesFrame:GetWide()/1.09,writeFrame:GetY()*4.7)
			showMoreButton:SetSize(25,25)
			showMoreButton:SetText("...")
			showMoreButton:SetEnabled( false )

			--[[local delNoteButton = scrollNotesFrame:Add("DButton")
			delNoteButton:SetPos(writeFrame:GetX()/2,writeFrame:GetY()*4.57)
			delNoteButton:SetSize(scrollNotesFrame:GetWide()/1.08,writeFrame:GetTall()/12.5)--]]
			--delNoteButton:SetImage("sprites/ui/MonoPad/DelNoteButton.png")
			local n
--[[			delNoteButton.DoClick = function()
				for k,v in pairs(ButtonTables) do
					if(ButtonNow[1]:GetText() == v.name) then
						n=k
					end
				end
				table.remove(ButtonTables,n)
				maxNotes = maxNotes-1
				ButtonNow[1]:Remove()
			end--]]
			local currentChatId = -1
			local notesList = scrollNotesFrame:Add("DScrollPanel")
			notesList:SetPos(writeFrame:GetX()/8, writeFrame:GetY()/20)
			notesList:SetSize(scrollNotesFrame:GetWide()/1.06,scrollNotesFrame:GetTall()/1.11)
			local function GetTime(time)
				if time == nil then
					time = 0
				end
				local hour = math.floor(time / 150)
				local minute = math.floor((time - hour * 150)/150*60)
				if minute < 10 then
					minute = "0"..minute
				end
				return hour, minute
			end
			local function UpdateChat()
				--PrintTable(chatListTable)
				if(chatTrueButton == true) then
					сhatList:Clear()


					for i = 1, #chatListTable do
						for k = 1, #chatListTable[i]["Characters"] do
							if monopadName == chatListTable[i]["Characters"][k] then
								local noteButton = сhatList:Add( "DButton" )
								if #chatListTable[i]["Characters"] == 2 then
									if k == 1 then
										noteButton:SetText( chatListTable[i]["Characters"][2] )
									else
										noteButton:SetText( chatListTable[i]["Characters"][1] )
									end
								else
									noteButton:SetText( chatListTable[i]["Name"] )
								end
								noteButton:Dock( TOP )
								noteButton:DockMargin( 0, 0, 0, 5 )
								local id = chatListTable[i]["id"]
								if newMessages[id] then
									--noteButton:SetFont("Default")
									noteButton:SetFont("ChatFont")
									--noteButton:SetTextColor(Color(202,44,247))
									--noteButton:SetTextColor(Color(152,0,100))
									--noteButton:SetTextColor(Color(146,56,58))
									--noteButton:SetTextColor(Color(203,47,51))
								end
								
								noteButton.DoClick = function()
								noteButton:SetFont("DermaDefault")
								--noteButton:SetTextColor(Color(0,0,0))
								newMessages[id] = false
								printLetterInput:SetEnabled( true )
								showMoreButton:SetEnabled( true )
									currentChatId = id
									notesList:Clear()
									local pixelScroll = 0
									for p = 1, #chatListTable[id]["Messages"] do
										if chatListTable[id]["Messages"][p]["Character"] == "Server" then
											local Panel = notesList:Add( "DFrame" )
											Panel:SetDraggable( false)
											Panel:SetSize( scrollNotesFrame:GetWide()/1.06, 25 )
											local hour, minute = GetTime(chatListTable[id]["Messages"][p]["Time"])
											Panel:SetTitle(chatListTable[id]["Messages"][p]["Text"].." ["..hour..":"..minute.."]")
											Panel:Dock( TOP )
											Panel:DockMargin( 0, 0, 0, 0)
											Panel:ShowCloseButton(false)
										else
											local Panel = notesList:Add( "DFrame" )
											Panel:SetDraggable( false )
											Panel:SetSize( scrollNotesFrame:GetWide()/1.06, 100 )
											local hour, minute = GetTime(chatListTable[id]["Messages"][p]["Time"])
											Panel:SetTitle(chatListTable[id]["Messages"][p]["Character"].." ["..hour..":"..minute.."]")
											Panel:Dock( TOP )
											Panel:DockMargin( 0, 0, 0, 0)
											Panel:ShowCloseButton(false)
											local CharFace = Panel:Add("DImage")
											CharFace:SetSize( 70, 70 )
											CharFace:SetPos(5,25)
											local name = GetSpriteFolder(chatListTable[id]["Messages"][p]["Character"])
											CharFace:SetImage("sprites/face/"..name..".png")
											local DTextEntry = vgui.Create( "DTextEntry", Panel )
											DTextEntry:SetSize( Panel:GetWide()-95, Panel:GetTall()-25 )
											DTextEntry:SetPos( 80, 25)
											DTextEntry:SetDisabled(true)
											DTextEntry:SetText( chatListTable[id]["Messages"][p]["Text"] )
											DTextEntry:SetMultiline( true )
											pixelScroll =  pixelScroll + DTextEntry:GetTall()
										end
									end
									notesList:GetVBar():AnimateTo(pixelScroll+250,0,0,1)
								end
							elseif currentChatId == chatListTable[i]["id"] then
								--notesList:Clear()
							end
						end
					end
				end
			end
			UpdateChat()



			function printLetterInput:OnKeyCodePressed(...)
				if (... == 64 and printLetterInput:GetText() ~= "" and currentChatId > 0) then
					net.Start('AddNewMessage')
					net.WriteFloat(currentChatId)
					local letter = {{["Character"] = monopadName,["Text"] = printLetterInput:GetText()}}
					net.WriteTable(letter)
					printLetterInput:SetText("")
					net.SendToServer()
					--CLoseMonopad()
				end
			end
			net.Receive("UpdateChatsList", function (len,ply )
				chatListTable = net.ReadTable()
				if (!trueButtonMonopad) then
					UpdateChat()
				end
			end)

			net.Receive("UpdateChat", function (len,ply )
				local id = net.ReadFloat()
				chatListTable = net.ReadTable()
				if (!trueButtonMonopad and chatTrueButton) then
					if currentChatId == id then
						if chatListTable[id]["Messages"][#chatListTable[id]["Messages"]]["Character"] == "Server" then
							local Panel = notesList:Add( "DFrame" )
							Panel:SetDraggable( false)
							Panel:SetSize( scrollNotesFrame:GetWide()/1.06, 25 )
							local hour, minute = GetTime(chatListTable[id]["Messages"][#chatListTable[id]["Messages"]]["Time"])
							--print(#chatListTable[id]["Messages"])
							Panel:SetTitle(chatListTable[id]["Messages"][#chatListTable[id]["Messages"]]["Text"].." ["..hour..":"..minute.."]")
							Panel:Dock( TOP )
							Panel:DockMargin( 0, 0, 0, 0)
							Panel:ShowCloseButton(false)
						else
							local Panel = notesList:Add( "DFrame" )
							Panel:SetDraggable( false )
							Panel:SetSize( scrollNotesFrame:GetWide()/1.06, 100 )
							local hour, minute = GetTime(chatListTable[id]["Messages"][#chatListTable[id]["Messages"]]["Time"])
							Panel:SetTitle(chatListTable[id]["Messages"][#chatListTable[id]["Messages"]]["Character"].." ["..hour..":"..minute.."]")
							Panel:Dock( TOP )
							Panel:DockMargin( 0, 0, 0, 0)
							Panel:ShowCloseButton(false)
							local CharFace = Panel:Add("DImage")
							CharFace:SetSize( 70, 70 )
							CharFace:SetPos(5,25)
							local name = GetSpriteFolder(chatListTable[id]["Messages"][#chatListTable[id]["Messages"]]["Character"])
							CharFace:SetImage("sprites/face/"..name..".png")
							local DTextEntry = vgui.Create( "DTextEntry", Panel )
							DTextEntry:SetSize( Panel:GetWide()-95, Panel:GetTall()-25 )
							DTextEntry:SetPos( 80, 25)
							DTextEntry:SetDisabled(true)
							DTextEntry:SetText( chatListTable[id]["Messages"][#chatListTable[id]["Messages"]]["Text"] )
							DTextEntry:SetMultiline( true )
						end
					else
						newMessages[id] = true
						UpdateChat()
					end
				else

					for i = 1, #chatListTable[id]["Characters"] do
						if LocalPlayer():Name() == chatListTable[id]["Characters"][i] and LocalPlayer():HasWeapon("monopad") then
							notification.AddLegacy( "У вас новое сообщение", NOTIFY_GENERIC, 4 )
							if (announcementSound) then
								sound.PlayFile( "sound/newmessage.mp3", "", function( channel )
									channel:Play()
									channel:SetVolume( 0.2 )
								end)
							end
				end
					end
				end
			end)

			notesList:ScrollToChild( notesList:GetChild(1))

			announcementButton.DoClick = function()
				announcementSound = !announcementSound
				if(announcementSound) then
					announcementButton:SetTooltip("Звук оповещения о новых сообщений: включён")
				else
					announcementButton:SetTooltip("Звук оповещения о новых сообщений: выключен")
				end
			end

			addNoteButton.DoClick = function()
				local сhatList4 = writeFrame:Add("DFrame")
				сhatList4:SetPos(addNoteButton:GetX(), addNoteButton:GetY()-300)
				сhatList4:SetSize(addNoteButton:GetWide(),300)
				сhatList4:SetDraggable(false)
				сhatList4:SetTitle("Персонажи")
				local OneMoreScroll = vgui.Create("DScrollPanel",сhatList4)
				OneMoreScroll:SetSize(сhatList4:GetWide(),сhatList4:GetTall()-25)
				OneMoreScroll:SetPos(0,25)
				--[[local chatListScroll3 = vgui.Create("DScrollPanel",сhatList4)
				chatListScroll3:SetSize(сhatList4:GetWide(),сhatList4:GetTall()-25)--]]
				--chatListScroll3:SetPos(0,25)
				local NewChatName = vgui.Create("DTextEntry",сhatList4)
				NewChatName:SetSize(сhatList4:GetWide()/4*3,25)
				NewChatName:SetPos(0,сhatList4:GetTall()-25)
				NewChatName:SetPlaceholderText("Название чата")
				local NewChatButton = vgui.Create("DButton",сhatList4)
				NewChatButton:SetSize(сhatList4:GetWide()/4,25)
				NewChatButton:SetPos(сhatList4:GetWide()/4*3,сhatList4:GetTall()-25)
				NewChatButton:SetText("Создать")
				local plys = player.GetAll()
				local tbl4 = {monopadName}
				for i = 1, #plys do
					local noteButton = vgui.Create("DCheckBoxLabel",OneMoreScroll)
					noteButton:SetSize(сhatList4:GetWide(),25)
					noteButton:SetText( plys[i]:Name())
					noteButton:Dock( TOP )
					noteButton:DockMargin( 0, 0, 0, 5 )
					if noteButton:GetText() == monopadName then
						noteButton:SetValue(true)
						noteButton:SetEnabled( false )
					end
						--table.Add(tbl4, LocalPlayer():Name())
						function noteButton:OnChange( val )
							if val then
								--table.Add(tbl4[1], noteButton:GetText())
								tbl4[#tbl4+1] = noteButton:GetText()
								--print(noteButton:GetText())
							else
								table.RemoveByValue(tbl4, noteButton:GetText())
							end
						end
						--[[noteButton.OnChange = function(val)
							if val then
								print("hi")
								table.Add(tbl4, noteButton:GetText())
								PrintTable(tbl4)
							else
								table.RemoveByValue(tbl4, noteButton:GetText())
							end
						end--]]

				end

				NewChatButton.DoClick = function()
				local tbl = {{["Name"] = NewChatName:GetText(),["Characters"] = {}}}
				--tbl[1]["Characters"] = tbl4
				for i = 1, #tbl4 do

					tbl[1]["Characters"][i] = tbl4[i]
				end	
				--tbl[1]
				--print("лох")
				--local tbl2 = {}
				net.Start("AddNewChat")
				net.WriteTable(tbl)
				net.SendToServer()	
				сhatList4:Remove()
				end



			end

--[[			for k,v in pairs(ButtonTables) do
				local noteButton = notesList:Add( "DButton" )
				noteButton:SetText( v.name )
				noteButton:Dock( TOP )
				noteButton:DockMargin( 0, 0, 0, 5 )
				noteButton.DoClick = function()
					TitleText:SetText(v.name)
					MainText:SetText(v.text)
					ButtonNow[1] = noteButton
				end
				maxNotes = k+1
			end--]]
--[[
			scrollNotesFrame:SetPos(notesFrame:GetX()*1.75,notesFrame:GetY()/1.92)
			scrollNotesFrame:ShowCloseButton(false)
            scrollNotesFrame:SetTitle("")
            scrollNotesFrame:SetSize(notesFrame:GetWide()/4*3,notesFrame:GetTall()*0.855)
--]]



			showMoreButton.DoClick = function()
				if (!showMoreFrame) then
					local сhatList5 = scrollNotesFrame:Add("DFrame")
					showMoreFrame = сhatList5
					сhatList5:SetPos(addNoteButton:GetX()+scrollNotesFrame:GetWide()/1.06-addNoteButton:GetWide(), addNoteButton:GetY()-300)
					сhatList5:SetSize(addNoteButton:GetWide(),300)
					сhatList5:SetDraggable(false)
					сhatList5:ShowCloseButton(false)
					сhatList5:SetTitle("Участники чата")
					local OneMoreScroll1 = vgui.Create("DScrollPanel",сhatList5)
					OneMoreScroll1:SetSize(сhatList5:GetWide(),сhatList5:GetTall()-75)
					OneMoreScroll1:SetPos(0,25)
					local plys = player.GetAll()
					local NewChatName1 = vgui.Create("DTextEntry",сhatList5)
					NewChatName1:SetSize(сhatList5:GetWide()/4*3,25)
					NewChatName1:SetPos(0,сhatList5:GetTall()-25)
					NewChatName1:SetPlaceholderText("Новое название чата")
					local NewChatButton1 = vgui.Create("DButton",сhatList5)
					NewChatButton1:SetSize(сhatList5:GetWide()/4,25)
					NewChatButton1:SetPos(сhatList5:GetWide()/4*3,сhatList5:GetTall()-25)
					NewChatButton1:SetText("Поменять")
					NewChatButton1.DoClick = function()
						if (NewChatName1:GetText() ~= "") then
							net.Start("RenameChat")
							net.WriteFloat(currentChatId)
							net.WriteString(NewChatName1:GetText())
							net.SendToServer()
						end
					end
					local LeaveChatButton = vgui.Create("DButton",сhatList5)
					LeaveChatButton:SetSize(сhatList5:GetWide()/2,25)
					LeaveChatButton:SetPos(сhatList5:GetWide()/2,сhatList5:GetTall()-50)
					LeaveChatButton:SetText("Покинуть чат")
					LeaveChatButton.DoClick = function()
						--if (NewChatName1:GetText() ~= "") then
						net.Start("PlayerLeaveChat")
						net.WriteFloat(currentChatId)
						net.WriteString(monopadName)
						net.SendToServer()
						currentChatId = 0
					    notesList:Clear()
					--end
					end

					local AddPlayerButton = vgui.Create("DButton",сhatList5)
					AddPlayerButton:SetSize(сhatList5:GetWide()/2,25)
					AddPlayerButton:SetPos(0,сhatList5:GetTall()-50)
					AddPlayerButton:SetText("Добавить игрока в чат")
					AddPlayerButton.DoClick = function()
						local сhatList6 = сhatList5:Add("DFrame")
						сhatList6:SetPos(0, 0)
						сhatList6:SetSize(addNoteButton:GetWide(),300)
						сhatList6:SetDraggable(false)
						сhatList6:SetTitle("Добавить участника в чат")
						local OneMoreScroll1 = vgui.Create("DScrollPanel",сhatList6)
						OneMoreScroll1:SetSize(сhatList6:GetWide(),сhatList6:GetTall()-50)
						OneMoreScroll1:SetPos(0,25)
						local AddPlayerButton = vgui.Create("DButton",сhatList6)
						AddPlayerButton:SetSize(сhatList6:GetWide(),25)
						AddPlayerButton:SetPos(0,сhatList6:GetTall()-25)
						AddPlayerButton:SetText("Добавить")
						local plys1 = player.GetAll()
						local plys = {}
						for i = 1, #plys1 do
							plys[i] = plys1[i]:Name()
						end
						for i = 1, #chatListTable[currentChatId]["Characters"] do
							table.RemoveByValue(plys,chatListTable[currentChatId]["Characters"][i])
						end
						local tbl4 = {}
						for i = 1, #plys do
							local noteButton = vgui.Create("DCheckBoxLabel",OneMoreScroll1)
							noteButton:SetSize(сhatList6:GetWide(),25)
							noteButton:SetText( plys[i])
							noteButton:Dock( TOP )
							noteButton:DockMargin( 10, 10, 0, 5 )
							function noteButton:OnChange( val )
							if val then
								--table.Add(tbl4[1], noteButton:GetText())
								tbl4[#tbl4+1] = noteButton:GetText()
								--print(noteButton:GetText())
							else
								table.RemoveByValue(tbl4, noteButton:GetText())
							end
						end
						AddPlayerButton.DoClick = function()
						local tbl = {{["Characters"] = {}}}
				--tbl[1]["Characters"] = tbl4
						for i = 1, #tbl4 do

						tbl[1]["Characters"][i] = tbl4[i]
						end	
						net.Start("AddNewCharacterToChat")
						net.WriteFloat(currentChatId)
						net.WriteTable(tbl)
						net.SendToServer()
						end
					end
				end

				--local tbl4 = {LocalPlayer():Name()}
				for i = 1, #chatListTable[currentChatId]["Characters"] do
					--for i = 1, 100 do
					local noteButton1 = vgui.Create("DLabel",OneMoreScroll1)
					noteButton1:SetSize(сhatList5:GetWide(),25)
					noteButton1:SetText( chatListTable[currentChatId]["Characters"][i])
					--noteButton1:SetText( LocalPlayer():Name())
					noteButton1:Dock( TOP )
					noteButton1:DockMargin( 10, 0, 0, 5 )
				end
			else
				showMoreFrame:Remove()
				showMoreFrame = nil
			end
			end



			local closeButton = notesFrame:Add("DImageButton")
            closeButton:SetSize(bodyFrame:GetWide()/26,bodyFrame:GetTall()/26)
            closeButton:SetPos(bodyFrame:GetX()*7.7, bodyFrame:GetY()/9.5)
            closeButton:SetImage("sprites/ui/MonoPad/CloseButton.png")
            closeButton.DoClick = function()
            	writeFrame:MoveTo(notesFrame:GetX(),ScrH()+5,0.2,0,-1)
            	scrollNotesFrame:MoveTo(notesFrame:GetX(),ScrH()+5,0.2,0,-1)
            	notesFrame:MoveTo(notesFrame:GetX(),ScrH()+5,0.2,0,-1,function()
            		rulesButton:SetMouseInputEnabled(true)
					notesButton:SetMouseInputEnabled(true)
					evidenceButton:SetMouseInputEnabled(true)
					chatButton:SetMouseInputEnabled(true)
					notesFrame:AlphaTo(50, 0.2,0,function()
            			notesFrame:Remove()
            			bodyFrame:SetMouseInputEnabled(true)
            		end)
            	chatTrueButton = false
            	end)
            end

			notesFrame:AlphaTo(255, 0.2,0)
			bodyFrame:SetMouseInputEnabled(false)
		end)

		bodyFrame:MoveTo(bodyFrame:GetX(),ScrH()/10,0.8,0,-1,function()
			blackScreenImage:AlphaTo(50, 0.8,0,function()
				rulesButton:AlphaTo(255, 0.2,0,function()
					rulesButton:SetMouseInputEnabled(true)
					notesButton:AlphaTo(255, 0.2,0,function()
						notesButton:SetMouseInputEnabled(true)
						evidenceButton:AlphaTo(255, 0.2,0,function()
							evidenceButton:SetMouseInputEnabled(true)
								chatButton:AlphaTo(255, 0.2,0,function()
									chatButton:SetMouseInputEnabled(true)
							end)
						end)
					end)
				end)
			end)
		end)
end
	end
end
hook.Add( "PlayerButtonDown", "Monopad", function( ply, button )
	if button==23 and trueButtonMonopad and countActive then
		if (LocalPlayer():GetWeapon("monopad") != NULL) then
			OpenMonopad()
		end
	end
	if button==23 and trueButtonMonopad and IsValid(ply:GetVehicle()) then
		if ply:GetVehicle():GetClass() == "prop_vehicle_prisoner_pod" then
			if (LocalPlayer():GetWeapon("monopad") != NULL) then
				OpenMonopad()
			end
		end
	end
end)
	net.Receive("TryOpenMonopad2", function()
	OpenMonopad()
end)

net.Receive("OpenMonopad", function()
	OpenMonopad()
end)


surface.CreateFont("FontChoiceAct", {
    font = "Catallina",
    size = (ScrW()+ScrH())/140,
    weight = 400,
    extended = true,
})

surface.CreateFont("FontStatus", {
    font = "Catallina",
    size = (ScrW()+ScrH())/200,
    weight = 400,
    extended = true,
})

local _NFrame = nil
local SosText = nil
local range = 250
local function Status()
    local NFrame = vgui.Create("DFrame")
    _NFrame = NFrame
    NFrame:MakePopup()
    NFrame:Center()
    NFrame:SetSize(400,125)
    NFrame:SetTitle("")
    NFrame.Paint = function(self,w,h)
        draw.RoundedBoxEx(8, 0, 0, w, h, Color(88,221,246))
        draw.RoundedBoxEx(8, 0+w/100, 0+h/40, w/1.018, h/1.05, Color(0,0,0,220))
    end

    local titleNFrame = NFrame:Add("DLabel")
    titleNFrame:SetSize(NFrame:GetWide()/3,50)
    titleNFrame:SetPos(NFrame:GetWide()/20,-10)
    titleNFrame:SetText("ВВЕДИТЕ СОСТОЯНИЕ")
    titleNFrame:SetFont("FontStatus")

    local NTextEntry = vgui.Create("DTextEntry", NFrame)
    NTextEntry:SetPos(5, 25)
    NTextEntry:SetSize(390, 20)
    NTextEntry:SetText(LocalPlayer():GetNWString("SosText"))

    local NButton1 = vgui.Create("DButton", NFrame)
    NButton1:SetText("ОЧЕНЬ БЛИЗКО")
    NButton1:SetPos(NFrame:GetWide()/20, 50)
    NButton1:SetSize(NFrame:GetWide()/4.4, 20)
    NButton1:SetFont("FontStatus")
    NButton1.DoClick = function()
        range = 100
    end
    NButton1.Paint = function(self,w,h)
        draw.RoundedBoxEx(8, 0, 0, w, h, Color(88,221,246))
    end

    local NButton2 = vgui.Create("DButton", NFrame)
    NButton2:SetFont("FontStatus")
    NButton2:SetText("БЛИЗКО")
    NButton2:SetPos(NButton1:GetX()+NButton1:GetWide()*1.1, 50)
    NButton2:SetSize(NFrame:GetWide()/4.4, 20)
    NButton2.DoClick = function()
        range = 250
    end
    NButton2.Paint = function(self,w,h)
        draw.RoundedBoxEx(8, 0, 0, w, h, Color(88,221,246))
    end

    local NButton3 = vgui.Create("DButton", NFrame)
    NButton3:SetText("СТАНДАРТНАЯ")
    NButton3:SetPos(NButton2:GetX()+NButton2:GetWide()*1.1, 50)
    NButton3:SetSize(NFrame:GetWide()/4.4, 20)
    NButton3:SetFont("FontStatus")
    NButton3.DoClick = function()
        range = 500
    end
    NButton3.Paint = function(self,w,h)
        draw.RoundedBoxEx(8, 0, 0, w, h, Color(88,221,246))
    end

    local NButton4 = vgui.Create("DButton", NFrame)
    NButton4:SetText("ДАЛЕКО")
    NButton4:SetPos(NButton3:GetX()+NButton3:GetWide()*1.1, 50)
    NButton4:SetSize(NFrame:GetWide()/6, 20)
    NButton4:SetFont("FontStatus")
    NButton4.DoClick = function()
        range = 1000
    end
    NButton4.Paint = function(self,w,h)
        draw.RoundedBoxEx(8, 0, 0, w, h, Color(88,221,246))
    end

    local SaveButton = vgui.Create("DButton", NFrame)
    SaveButton:SetText("СОхранить")
    SaveButton:SetPos(NFrame:GetWide()/4, 75)
    SaveButton:SetFont("FontStatus")
    SaveButton:SetSize(NFrame:GetWide()/2, NFrame:GetTall()/6)
    SaveButton.DoClick = function()
        net.Start("SetSos")
        net.WriteEntity(LocalPlayer())
        net.WriteString(NTextEntry:GetText())
        net.WriteFloat(range)
        net.SendToServer()
    end
    SaveButton.Paint = function(self,w,h)
        draw.RoundedBoxEx(8, 0, 0, w, h, Color(88,221,246))
    end

    local SaveButton = vgui.Create("DButton", NFrame)
    SaveButton:SetText("Удалить сОстОяние")
    SaveButton:SetPos(NFrame:GetWide()/4, 100)
    SaveButton:SetFont("FontStatus")
    SaveButton:SetSize(NFrame:GetWide()/2, NFrame:GetTall()/6)
    SaveButton.DoClick = function()
        net.Start("DelSos")
        net.WriteEntity(LocalPlayer())  
        net.SendToServer()
    end
    SaveButton.Paint = function(self,w,h)
        draw.RoundedBoxEx(8, 0, 0, w, h, Color(88,221,246))
    end
end

local BodyFrame = nil
local function bodyGroupsEditor()
    local ply = LocalPlayer()
    SlideBG = {}
            if BodyFrame ~= nil then
                 BodyFrame:Remove()
                end
        BodyFrame = vgui.Create( "DFrame" )
        BodyFrame:SetSize( ScrW()/2, ScrH()/3*2)
        BodyFrame:SetPos(ScrW()/4, ScrH()/4)
        BodyFrame:MakePopup()
        BodyFrame:SetTitle("")
        BodyFrame:ShowCloseButton(true)
        BodyFrame:SetScreenLock(false)
        BodyFrame:SetDraggable(false)
        BodyFrame.Paint = function(self,w,h)
            draw.RoundedBoxEx(8, 0, 0, w, h, Color(88,221,246))
            draw.RoundedBoxEx(8, 0+w/100, 0+h/70, w/1.018, h/1.03, Color(0,0,0,220))
        end
        
            local Model = vgui.Create("DModelPanel", BodyFrame)
            Model:SetPos(-ScrW()/9,-30)
            Model:SetSize(ScrW()/2,ScrH()/1.5)
            Model:SetModel(LocalPlayer():GetModel())
         local en = nil
            function Model:LayoutEntity( ent )
                if en == nil then
                for k,v in pairs(ply:GetBodyGroups()) do
            if(ply:GetBodygroupCount(k)>1) then
                ent:SetBodygroup(k,ply:GetBodygroup(k))
                        end
                    end
                    end
                en = ent
            end
            local BodyPanel = vgui.Create( "DScrollPanel", BodyFrame )
        BodyPanel:Dock( FILL )
        local iterBG = 1
        local hBG = 0
            
        for k,v in pairs(ply:GetBodyGroups()) do
            if(ply:GetBodygroupCount(k)>1) then
                local BGNumSlider = vgui.Create( "DNumSlider", BodyPanel )
                BGNumSlider:SetPos( ScrW()/4, hBG )              
                BGNumSlider:SetSize( BodyFrame:GetWide()/3, BodyPanel:GetTall()/1.1 )     
                    local hm = ""
                    hm = ply:GetBodygroupName(k)[1]:upper()
                    for i=2, 100 do
                        hm = hm .. ply:GetBodygroupName(k)[i]
                    end
                BGNumSlider:SetText(hm)
                BGNumSlider:SetMin( 0 )                 
                BGNumSlider:SetMax( ply:GetBodygroupCount(k)-1)         
                BGNumSlider:SetDecimals( 0 )
                BGNumSlider:SetValue(ply:GetBodygroup(k))
                BGNumSlider.OnValueChanged = function( self, value )
                       en:SetBodygroup(k,value)
                end
                SlideBG[iterBG] = BGNumSlider
                hBG = hBG + BGNumSlider:GetTall()*2
                iterBG = iterBG+1
            end
        end
        
        local BGButton = BodyPanel:Add("DButton")
        BGButton:SetText( "Применить" )             
        BGButton:SetPos( ScrW()/4, hBG )
        BGButton:SetFont("FontStatus")          
        BGButton:SetSize( BodyPanel:GetWide()*1.2, BodyPanel:GetTall() )
        BGButton.Paint = function(self,w,h)
            draw.RoundedBoxEx(8, 0, 0, w, h, Color(88,221,246))
        end        
        BGButton.DoClick = function()
        local iBG = 1
            for k = 0, ply:GetNumBodyGroups() - 1 do
                if(ply:GetBodygroupCount(k)>1) then
                    net.Start("BodyGroupSelect")
                    net.WriteString(LocalPlayer():SteamID() .. " " .. k .." " .. SlideBG[iBG]:GetValue())
                    net.SendToServer()
                    iBG=iBG+1
                end
            end
        end
        if(LocalPlayer():Nick()=="Токо Фукава") then
            local MorphButton = BodyPanel:Add("DButton")
            local morph
            if (LocalPlayer():GetModel()=="models/player/dewobedil/danganronpa/toko_fukawa/default_p.mdl") then
                MorphButton:SetImage( "sprites/ui/TokoButton/Genocide.png" )
                morph = true
            elseif (LocalPlayer():GetModel()=="models/player/dewobedil/danganronpa/toko_fukawa/genocide_p.mdl") then 
                MorphButton:SetImage( "sprites/ui/TokoButton/Toko.png" )
                morph = false
            end                         
            MorphButton:SetPos( ScrW()/4+250, hBG+30 )  
            MorphButton:SetText( "" )           
            MorphButton:SetSize( 110, 100 )  
            MorphButton.Paint = function(self,w,h)
                draw.RoundedBoxEx(8, 0, 0, w, h, Color(88,221,246))
            end         
            MorphButton.DoClick = function()
                morph = !morph
                if (morph==false) then
                    Model:SetModel("models/player/dewobedil/danganronpa/toko_fukawa/genocide_p.mdl")
                    MorphButton:SetImage( "sprites/ui/TokoButton/Toko.png" )
                    net.Start("TokoModelSelector")
                    local tbl = {LocalPlayer(),morph}
                    net.WriteTable(tbl)
                    net.SendToServer()
                else
                    Model:SetModel("models/player/dewobedil/danganronpa/toko_fukawa/default_p.mdl")
                    MorphButton:SetImage( "sprites/ui/TokoButton/Genocide.png" )
                    net.Start("TokoModelSelector")
                    local tbl = {LocalPlayer(),morph}
                    net.WriteTable(tbl)
                    net.SendToServer()
                end     
            end 
        end
    end


surface.CreateFont("FontHelp", {
    font = "Yahfie",
    size = (ScrW()+ScrH())/60,
    weight = 400,
    extended = true,
})

surface.CreateFont("FontHelp2", {
    font = "Yahfie",
    size = (ScrW()+ScrH())/100,
    weight = 400,
    extended = true,
})

local function HelpPanel()
    local helpPanel = vgui.Create("DFrame")
    helpPanel:SetSize(ScrW()/1.5,ScrH()/1.5)
    helpPanel:Center()
    helpPanel:ShowCloseButton(false)
    helpPanel:MakePopup()
    helpPanel:SetTitle("")
    helpPanel.Paint = function(self,w,h)
        draw.RoundedBoxEx(8, 0, 0, w, h, Color(198,165,125))
        draw.RoundedBoxEx(8, 0+w/100, 0+h/70, w/1.018, h/1.03, Color(16,11,27))
    end

    local infoText = helpPanel:Add("DLabel")
    infoText:SetPos(helpPanel:GetWide()/20,helpPanel:GetTall()/20)
    infoText:SetFont("FontHelp")
    infoText:SetText("Команды для РП:")
    infoText:SizeToContents()

    local infoText2 = helpPanel:Add("DLabel")
    infoText2:SetPos(infoText:GetX(),infoText:GetY()+infoText:GetTall()*1.1)
    infoText2:SetFont("FontHelp2")
    infoText2:SetText(" - i или me - действие от лица персонажа. Пример: /i взяла лом - Джунко взяла лом \n - ev или do - действие от 3-го лица. Пример: Из кухни исходит запах горелого \n - att или try  - попытка совершить действие. Пример: Джунко удачно убила Надежду \n - dice или roll - случайное число от 1 до 100. Пример: Джунко выпало число: 100 \n - !ls или !pm + имя персонажа - написать сообщение определённому человеку. \n Пример: !ls Микан, давай убийство сделаем :3 \n - !gm - написать ГМ'у. !admin - администратору. \n - t - написать в чат слова сказанные персонажем \n Пример: Джунко говорит: 'Идите к чёрту!' \n - !eng и !jap - установить язык согласий(работает только с персонажами основной трилогии)\n - Команды через ! - действуют в небольшом радиусе\n(не относится к командам у которых знак ! стоит в примере написания) \n - Команды через / - действуют в большом радиусе \n - Сообщения через / - видны в большом радиусе (локальный чат). \n Такие сообщения пишутся голубым \n - Сообщения через // - видны всем. (глобальный чат)" )
    infoText2:SizeToContents()

    local junkoImageHelp = helpPanel:Add("DImage")
    junkoImageHelp:SetSize(helpPanel:GetWide()/4,helpPanel:GetTall()/3)
    junkoImageHelp:SetPos(helpPanel:GetWide()/1.4,helpPanel:GetTall()/1.53)
    junkoImageHelp:SetImage("JunkoHelp.png")

    local closeImageHelp = helpPanel:Add("DImageButton")
    closeImageHelp:SetPos(helpPanel:GetWide()/1.1,helpPanel:GetTall()/20)
    closeImageHelp:SetImage("CloseHelp.png")
    closeImageHelp:SetSize(helpPanel:GetWide()/16,helpPanel:GetTall()/16)
    closeImageHelp.DoClick = function()
        helpPanel:Remove()
    end
    local forwardImageHelp = helpPanel:Add("DImageButton")
    forwardImageHelp:SetPos(helpPanel:GetWide()/1.1,closeImageHelp:GetTall()+closeImageHelp:GetY())
    forwardImageHelp:SetImage("HelpArrow.png")
    forwardImageHelp:SetSize(helpPanel:GetWide()/16,helpPanel:GetTall()/12)
    forwardImageHelp.DoClick = function()
    	sound.PlayFile( "sound/HelpSound.mp3", "", function( channel )
		channel:Play()
		channel:SetVolume( 0.8 )
    end)
        if forwardImageHelp:GetImage() == "HelpArrow.png" then
            infoText:SetText("Основные клавиши:")
            infoText:SizeToContents()
            forwardImageHelp:SetImage("HelpArrow1.png")
            infoText2:SetText(" - m - открыть/закрыть монопад.\nВ монопаде можно посмотреть время, количество мономонет, правила, найденные улики,\nа также писать заметки.\n - k(удерживать ) - открыть меню быстрых действий. На данный момент доступны следующие действия:\n Бросить кубик, задать статус, выбрать персонажа, изменить bodygroups, открыть окно с подсказкой,\n создать свой ragdoll, заснуть(доступно Чиаки и Марин)\n - l - Открыть меню подарков")
            infoText2:SizeToContents()
        else
            infoText:SetText("Команды для РП:")
            infoText:SizeToContents()
            forwardImageHelp:SetImage("HelpArrow.png")
            infoText2:SetText(" - i или me - действие от лица персонажа. Пример: /i взяла лом - Джунко взяла лом \n - ev или do - действие от 3-го лица. Пример: Из кухни исходит запах горелого \n - att или try  - попытка совершить действие. Пример: Джунко удачно убила Надежду \n - dice или roll - случайное число от 1 до 100. Пример: Джунко выпало число: 100 \n - !ls или !pm + имя персонажа - написать сообщение определённому человеку. \n Пример: !ls Микан, давай убийство сделаем :3 \n - !gm - написать ГМ'у. !admin - администратору. \n - t - написать в чат слова сказанные персонажем \n Пример: Джунко говорит: 'Идите к чёрту!' \n - !eng и !jap - установить язык согласий(работает только с персонажами основной трилогии)\n - Команды через ! - действуют в небольшом радиусе\n(не относится к командам у которых знак ! стоит в примере написания) \n - Команды через / - действуют в большом радиусе \n - Сообщения через / - видны в большом радиусе (локальный чат). \n Такие сообщения пишутся голубым \n - Сообщения через // - видны всем. (глобальный чат)" )
            infoText2:SizeToContents()
        end
    end
end

local wheel = nil

function draw.CircleChoice( x, y, radius, quality )
    local circle = {}
    local tmp = 0
    for i=1,quality do
        tmp = math.rad(i*360)/quality
        circle[i] = {x = x + math.cos(tmp)*radius,y = y + math.sin(tmp)*radius}
    end
    surface.DrawPoly( circle )
    return circle
end 

local ragdoll = nil
local weaponList = nil
net.Receive("RagdollPersonalClient", function (len,ply)
    ragdoll = net.ReadInt(16)
    local ragd = LocalPlayer():GetNWEntity("Ragdoll")
    if ragd ~= nil and ragd ~= NULL then

	end
end)
 	

function PointOnCircle( ang, radius, offX, offY )
	ang =  math.rad( ang )
	local x = math.cos( ang ) * radius + offX
	local y = math.sin( ang ) * radius + offY
	return x, y
end  

local diceTableActions = {{"На силу\n\nБрОсОк кОсти на силу\n\nЛКМ - Обычный брОсОк.\nПКМ - брОсОк с преимуществОм или пОмехОй.","dicesicons/strenght.png"},{"На лОвкОсть\n\nБрОсОк кОсти на лОвкОсть.\n\nЛКМ - Обычный брОсОк.\nПКМ - брОсОк с преимуществОм или пОмехОй.","dicesicons/dex.png"},{"На интеллект\n\nБрОсОк кОсти на интеллект. ЕгО результат также увидит ГМ.\n\nЛКМ - Обычный брОсОк.\nПКМ - брОсОк с преимуществОм или пОмехОй.","dicesicons/int.png"},{"На удачу\n\nКлассический случайный брОсОк кОсти От 1 дО 100 без каких-либО мОдификатОрОв.\n\n(ВпрОчем, у некОтОрых 'счастливчикОв' есть предраспОлОженнОсть к бОлее 'удачливым' брОскам)","dicesicons/luck.png"}}
local adventageTypeTable = {{"С пОмехОй\n\nЕсли на вас действует некая сила, услОжняющая вам дОстижение результата.\n\nПОнижает максимальные и минимальные пределы брОска.","dicesicons/disadvantage.png"},{"С преимуществОм\n\nЕсли на вас действует некая сила, Облегчающая вам дОстижение результата.\n\nПОвышает максимальные и минимальные пределы брОска.","dicesicons/advantage.png"}}
local centerX, centerY = ScrW()/2, ScrH()/2
local radius = (ScrW() + ScrH())/12
local numSquares
local function ChoseDiceAdventage(typeOfDice)
	timer.Simple(0.05, function (  )


        	numSquares = #adventageTypeTable
			local interval = 360 / numSquares
        	local coordTable = {}
        	local frameActions = vgui.Create("DFrame")
        	frameActions:SetSize(ScrW(),ScrH())
        	frameActions:MakePopup()
        	frameActions:ShowCloseButton(false)
        	frameActions:SetTitle("")
        	frameActions.Paint = function(self,w,h)
        	end
        	local panelTextAct = frameActions:Add("DPanel")
        	panelTextAct:SetSize(frameActions:GetWide()/4,frameActions:GetTall())
        	panelTextAct:SetPos(frameActions:GetWide()-panelTextAct:GetWide(), panelTextAct:GetY())
        	panelTextAct.Paint = function( self,w,h )
        		draw.RoundedBoxEx(6, 0, 0, w, h, Color(0,0,0,220))
        	end
        	local labelNameAct = panelTextAct:Add("DTextEntry")
        	labelNameAct:SetSize(frameActions:GetWide()/4-20,frameActions:GetTall()-20)
        	labelNameAct:SetPos(10,10)
        	labelNameAct:SetFont("FontChoiceAct")
        	labelNameAct:SetValue("Действие")
        	labelNameAct:SetMultiline(true)
            labelNameAct:SetEditable(false)
        	labelNameAct:SetPaintBackground(false)
			labelNameAct:SetTextColor(Color(255,255,255))
            for degrees = 1, 360, interval do
				local x, y = PointOnCircle( degrees, radius, centerX, centerY )
				table.insert(coordTable,{x-ScrW()/14/2,y-ScrH()/8/2})
			end
			for i=1,numSquares do
				local buttonAct = frameActions:Add("DButton")
				buttonAct:SetSize(ScrW()/14,ScrH()/8)
				buttonAct:SetPos(centerX-buttonAct:GetWide()/2, centerY-buttonAct:GetTall()/2)
				buttonAct:SetText("")
				buttonAct.Paint = function(self,w,h)
		            draw.RoundedBoxEx(6, 0, 0, w, h, Color(88,221,246))
		            draw.RoundedBoxEx(6, w/20, h/20, w-w/10, h-h/10, Color(0,0,0,220))
		            local imageButton = buttonAct:Add("DImage")
		            imageButton:SetPos(w/20, h/20)
			        imageButton:SetSize(w-w/10, h-h/10)
			        imageButton:SetImage(adventageTypeTable[i][2])
		        end
		        buttonAct.OnCursorEntered = function() 
					buttonAct:SetAlpha(200)
					action = i
					labelNameAct:SetValue(adventageTypeTable[i][1])
				end
				buttonAct.OnCursorExited = function()
					buttonAct:SetAlpha(255)
					action = 0
					labelNameAct:SetValue("")
				end
		        buttonAct:MoveTo(coordTable[i][1],coordTable[i][2],0.3,0,-1,function() end)
			end
            frameActions.Think = function( self )
                if (input.IsButtonDown( 107 ) and frameActions:IsValid() ) then
                    self:Remove()
                    if(action==1) then
                        RollDice(typeOfDice,"disadvantage")
                    end
                    if(action==2) then
                        RollDice(typeOfDice,"advantage")
                    end
                end
            end
            	end)
        end
    local function ChoseDice()
        	numSquares = #diceTableActions
			local interval = 360 / numSquares
        	local coordTable = {}
        	local frameActions = vgui.Create("DFrame")
        	frameActions:SetSize(ScrW(),ScrH())
        	frameActions:MakePopup()
        	frameActions:ShowCloseButton(false)
        	frameActions:SetTitle("")
        	frameActions.Paint = function(self,w,h)
        	end
        	local panelTextAct = frameActions:Add("DPanel")
        	panelTextAct:SetSize(frameActions:GetWide()/4,frameActions:GetTall())
        	panelTextAct:SetPos(frameActions:GetWide()-panelTextAct:GetWide(), panelTextAct:GetY())
        	panelTextAct.Paint = function( self,w,h )
        		draw.RoundedBoxEx(6, 0, 0, w, h, Color(0,0,0,220))
        	end
        	local labelNameAct = panelTextAct:Add("DTextEntry")
        	labelNameAct:SetSize(frameActions:GetWide()/4-20,frameActions:GetTall()-20)
        	labelNameAct:SetPos(10,10)
        	labelNameAct:SetFont("FontChoiceAct")
        	labelNameAct:SetValue("Действие")
        	labelNameAct:SetMultiline(true)
            labelNameAct:SetEditable(false)
        	labelNameAct:SetPaintBackground(false)
			labelNameAct:SetTextColor(Color(255,255,255))
            for degrees = 1, 360, interval do
				local x, y = PointOnCircle( degrees, radius, centerX, centerY )
				table.insert(coordTable,{x-ScrW()/14/2,y-ScrH()/8/2})
			end
			for i=1,numSquares do
				local buttonAct = frameActions:Add("DButton")
				buttonAct:SetSize(ScrW()/14,ScrH()/8)
				buttonAct:SetPos(centerX-buttonAct:GetWide()/2, centerY-buttonAct:GetTall()/2)
				buttonAct:SetText("")
				buttonAct.Paint = function(self,w,h)
		            draw.RoundedBoxEx(6, 0, 0, w, h, Color(88,221,246))
		            draw.RoundedBoxEx(6, w/20, h/20, w-w/10, h-h/10, Color(0,0,0,220))
		            local imageButton = buttonAct:Add("DImage")
		            imageButton:SetPos(w/20, h/20)
			        imageButton:SetSize(w-w/10, h-h/10)
			        imageButton:SetImage(diceTableActions[i][2])
		        end
		        buttonAct.OnCursorEntered = function() 
					buttonAct:SetAlpha(200)
					action = i
					labelNameAct:SetValue(diceTableActions[i][1])
				end
				buttonAct.OnCursorExited = function()
					buttonAct:SetAlpha(255)
					action = 0
					labelNameAct:SetValue("")
				end
		        buttonAct:MoveTo(coordTable[i][1],coordTable[i][2],0.3,0,-1,function() end)
			end
            frameActions.Think = function( self )
                if (input.IsButtonDown( 107 ) and frameActions:IsValid() ) then
                    self:Remove()
                    if(action==1) then
						--ChoseDiceAdventage("str")
						RollDice("str","")
                    end
                    if(action==2) then
                        --ChoseDiceAdventage("dex")
                        RollDice("dex","")
                    end
                    if(action==3) then
                       --ChoseDiceAdventage("int")
                       RollDice("int","")
                    end
                    if(action==4) then
                        RollDice("rand","")
                    end
                
            elseif (input.IsButtonDown( 108 ) and frameActions:IsValid() ) then
            	self:Remove()
            		if(action==1) then
						ChoseDiceAdventage("str")
						--RollDice("str","")
                    end
                    if(action==2) then
                        ChoseDiceAdventage("dex")
                        --RollDice("dex","")
                    end
                    if(action==3) then
                       ChoseDiceAdventage("int")
                       --RollDice("int","")
                    end
                    if(action==4) then
                        RollDice("rand","")
                    end
            	end
            end
        end


 	

local sleep = false
local ragd = false
hook.Add( "PlayerButtonDown", "StatusSleep", function( ply, button )
	 if button == 16 and IsFirstTimePredicted() and LocalPlayer():Alive() and sleep then
	 	Status()
	 end
end)
local tableActions = {{"БрОсить кубик\n\nЕсли вы не мОжете Определить, ктО из двух игрОкОв дОлжен выйти пОбедителем в вашем прОтивОстОянии, прОстО выберите тип брОска и пОлОжитесь на удачу.","Dice.png"},{"Статус\n\nЗадать статус, кОтОрый будут видеть все, ктО смОтрит на вас и нахОдятся в выбраннОм радиусе.","Status.png"},{"BОdyGrОups\n\nИзменение некОтОрых элементОв мОдели персОнажа(Если этО дОступнО для выбраннОй мОдели).","BodyGroups.png"},{"ВыбОр персОнажа\n\nОткрыть меню выбОра персОнажа.","ChoiceChar.png"},{"RagdOll\n\nСОздать рэгдОл(куклу с мОделью вашегО персОнажа). МОжет быть испОльзОвано для ОтыгрОвки пОтери сОзнания.","ragd.png"},{"ПОмОщь\n\nОткрыть пОдсказку пО ОснОвным кнОпкам и кОмандам для чата.","Help.png"},{"ГрОскОсть музыки\n\nОткрыть настрОйки грОмкОсти музыки","icons/sound_settings.png"},{"СОн\n\nНемедленнО заснуть.ЧтОбы прОснуться - нажмите кнОпку 'K' или 'E'.","Sleep.png"}}
    hook.Add( "PlayerButtonDown", "CircleActions", function( ply, button )
        if button == 21 and IsFirstTimePredicted() and LocalPlayer():Alive() and not sleep then
        	if(LocalPlayer():Nick()=="Чиаки Нанами" or LocalPlayer():Nick()=="Марин Мизута" or LocalPlayer():Nick()=="Акио Хираи") then
        		numSquares = #tableActions
        	else
        		numSquares = #tableActions-1
        	end
			local interval = 360 / numSquares
        	local coordTable = {}
        	local frameActions = vgui.Create("DFrame")
        	frameActions:SetSize(ScrW(),ScrH())
        	frameActions:MakePopup()
        	frameActions:ShowCloseButton(false)
        	frameActions:SetTitle("")
        	frameActions.Paint = function(self,w,h)
        	end
        	local panelTextAct = frameActions:Add("DPanel")
        	panelTextAct:SetSize(frameActions:GetWide()/4,frameActions:GetTall())
        	panelTextAct:SetPos(frameActions:GetWide()-panelTextAct:GetWide(), panelTextAct:GetY())
        	panelTextAct.Paint = function( self,w,h )
        		draw.RoundedBoxEx(6, 0, 0, w, h, Color(0,0,0,220))
        	end
        	local labelNameAct = panelTextAct:Add("DTextEntry")
        	labelNameAct:SetSize(frameActions:GetWide()/4-20,frameActions:GetTall()-20)
        	labelNameAct:SetPos(10,10)
        	labelNameAct:SetFont("FontChoiceAct")
        	labelNameAct:SetValue("Действие")
        	labelNameAct:SetMultiline(true)
            labelNameAct:SetEditable(false)
        	labelNameAct:SetPaintBackground(false)
			labelNameAct:SetTextColor(Color(255,255,255))
            for degrees = 1, 360, interval do
				local x, y = PointOnCircle( degrees, radius, centerX, centerY )
				table.insert(coordTable,{x-ScrW()/14/2,y-ScrH()/8/2})
			end
			for i=1,numSquares do
				local buttonAct = frameActions:Add("DButton")
				buttonAct:SetSize(ScrW()/14,ScrH()/8)
				buttonAct:SetPos(centerX-buttonAct:GetWide()/2, centerY-buttonAct:GetTall()/2)
				buttonAct:SetText("")
				buttonAct.Paint = function(self,w,h)
		            draw.RoundedBoxEx(6, 0, 0, w, h, Color(88,221,246))
		            draw.RoundedBoxEx(6, w/20, h/20, w-w/10, h-h/10, Color(0,0,0,220))
		            local imageButton = buttonAct:Add("DImage")
		            imageButton:SetPos(w/20, h/20)
			        imageButton:SetSize(w-w/10, h-h/10)
			        imageButton:SetImage(tableActions[i][2])
		        end
		        buttonAct.OnCursorEntered = function() 
					buttonAct:SetAlpha(200)
					action = i
					labelNameAct:SetValue(tableActions[i][1])
				end
				buttonAct.OnCursorExited = function()
					buttonAct:SetAlpha(255)
					action = 0
					labelNameAct:SetValue("")
				end
		        buttonAct:MoveTo(coordTable[i][1],coordTable[i][2],0.3,0,-1,function() end)
			end
            frameActions.Think = function( self )
                if ( not input.IsButtonDown( 21 ) and frameActions:IsValid() ) then
                    self:Remove()
                    if(action==1) then
                        ChoseDice()
                    end
                    if(action==2) then
                        Status()
                    end
                    if(action==3) then
                        bodyGroupsEditor()
                    end
                    if(action==4) then
                        net.Start("ButtonCharSelector")
                        net.SendToServer()
                    end
                    if(action==5) then
                        if ragdoll==nil then
                        	local blockRagd = vgui.Create( "DFrame" )
                        	blockRagd:SetSize(1,1)
                        	blockRagd:MakePopup()
                        	blockRagd:SetMouseInputEnabled(false)
                            net.Start("RagdollPersonal")
                            net.SendToServer()
                            ragd = !ragd
                            function blockRagd:OnKeyCodeReleased(...)
						        if (... == 21 and ragdoll~=nil) then
						        	blockRagd:Remove()
						        	net.Start("UnRagdollPersonal")
						            net.WriteInt(ragdoll, 16)
						            ragdoll = nil
						            weaponList = nil
						            net.SendToServer()
						        end
                             	if (... == 35 or ... == 31) then
						        	chat.Open(1)
						        end
						    end
                        else
                            net.Start("UnRagdollPersonal")
                            net.WriteInt(ragdoll, 16)
                            ragdoll = nil
                            weaponList = nil
                            net.SendToServer()
                            hook.Remove("CalcView", "MyCalcView")
                        end
                    end
                    if(action==6) then
                        HelpPanel()
                    end
                    if(action==7)then
                    	openSettings()
                    end
                    if(action==8) then
                    	ply:ScreenFade( SCREENFADE.OUT, Color( 0,0,0, 255 ), 2.1, 0 )
						ply:ScreenFade( SCREENFADE.STAYOUT, Color( 0,0,0, 255 ),5000,0)
						local sleepBlockFrame = vgui.Create("DFrame")
				        sleepBlockFrame:SetSize(1,1)
						net.Start("Sleep_Stand")
						net.WriteBool(sleep)
						net.SendToServer()
						sleep = !sleep
                    end
                end
            end
        elseif button == 21 and IsFirstTimePredicted() and LocalPlayer():Alive() and sleep then
        	ply:ScreenFade( SCREENFADE.PURGE, Color( 0,0,0, 0 ),1,0)
			ply:ScreenFade( SCREENFADE.IN, Color( 0,0,0, 255 ), 0.5, 0 )
			net.Start("Sleep_Stand")
			net.WriteBool(sleep)
			net.SendToServer()
			sleep = !sleep
		end
    end)

net.Receive("MoneyCheck", function(len,ply)
    if (monocoins<50) then
        notification.AddLegacy( "Недостаточно средств", NOTIFY_UNDO, 2 )
    else
        monocoins = monocoins - 50
        net.Start("PurchasePresent")
        net.SendToServer()
    end
end)

net.Receive("ChangePersonalMonocoins", function()
	local sign = net.ReadString()
	local numberMonocoins = net.ReadInt(18)
	if (sign == "+") then
		monocoins = monocoins + numberMonocoins
		LocalPlayer():PrintMessage(HUD_PRINTTALK, "Вам перечислили " .. numberMonocoins .. " мономонет. На данный момент у вас: " .. monocoins .. " мономонет")
	elseif (sign == "-") then
		monocoins = monocoins - numberMonocoins
		LocalPlayer():PrintMessage(HUD_PRINTTALK, "У вас отняли " .. numberMonocoins .. " мономонет. На данный момент у вас: " .. monocoins .. " мономонет")
	elseif (sign == "=") then
		monocoins = numberMonocoins
		LocalPlayer():PrintMessage(HUD_PRINTTALK, "Число ваших мономонет было изменено. Теперь у вас: " .. monocoins .. " мономонет")
	end
end)

net.Receive("SpawnVending3", function ()
	local lst2 = net.ReadEntity()
	local time = net.ReadFloat()
	local money = net.ReadDouble()
	if(money>monocoins) then
		LocalPlayer():PrintMessage(HUD_PRINTTALK, "А где деньги?!")
	else
	    if(lst2:IsValid()) then
	    	monocoins = monocoins - money
			net.Start("SpawnVending4")
			net.WriteVector(lst2:GetTrowPos():GetPos())
			net.WriteInt(monocoins, 16)
			net.SendToServer()
	    end
	end
end)






























hook.Add( "PlayerButtonDown", "Stars", function( ply, button )
	if button==22 and IsFirstTimePredicted() then
		local radiusV = (ScrW() + ScrH())/7
		local starsFrame = vgui.Create( "DFrame" )
    	starsFrame:SetSize(ScrW(),ScrH())
    	starsFrame:MakePopup()
    	starsFrame:ShowCloseButton( false )
    	starsFrame:SetDraggable( false )
    	starsFrame:SetTitle("")
    	starsFrame.Paint = function (self,w,h)
			draw.RoundedBox(5,0,0,w,h,Color(0,0,0,255))
		end

		local chl = nil

		sound.PlayFile( "sound/stars/begin.mp3", "", function( channel )
	        channel:Play()
	        channel:SetVolume( 1 )
	        chl = channel
    	end)

    	local starsFon = starsFrame:Add("DImage")
    	starsFon:SetSize(ScrW(),ScrH())
    	starsFon:SetImage("materials/stars/FonStars.jpg")
    	starsFon:MakePopup()


    	function starsFrame:OnKeyCodeReleased(...)
	        if ...==22 then
	        	starsFrame:Remove()
	        	chl:Stop()
	        end
	       	if ...==64 then
	        	sound.PlayFile( "sound/stars/end.mp3", "", function( channel )
			        channel:Play()
			        channel:SetVolume( 1 )
			        chl = channel
		    	end)
		    	starsFon:AlphaTo(0, 3, 0, function()
		    		starsFrame:Remove()
		    	end)
	        end
	    end


        function starsFon:OnKeyCodeReleased(...)
	        if ...==22 then
	        	starsFrame:Remove()
	        	chl:Stop()
	        end
	        if ...==51 then
	        	sound.PlayFile( "sound/stars/end.mp3", "", function( channel )
			        channel:Play()
			        channel:SetVolume( 1 )
			        chl = channel
		    	end)
		    	starsFon:ColorTo(Color(255,255,255,255), 3, 0, function()
		    		starsFrame:Remove()
		    	end)
	        end
	    end

		local numBubble = 13
		local interval = 360 / numBubble
    	local coordTable = {}
        for degrees = 1, 360, interval do
			local x, y = PointOnCircle( degrees, radiusV, centerX, centerY )
			table.insert(coordTable,{x-ScrW()/14/2,y-ScrH()/8/2})
		end
		local tableBut = {}
		starsFon:AlphaTo(0,0,0,function()
    		starsFon:AlphaTo(255,12,0,function()
				for i=1,numBubble do
					local buttonAct = starsFon:Add("DButton")
					table.insert(tableBut, buttonAct)
					buttonAct:SetSize(ScrW()/14,ScrH()/8)
					buttonAct:SetPos(centerX-buttonAct:GetWide()/2, centerY-buttonAct:GetTall()/2)
					buttonAct:SetText("")
					buttonAct.Paint = function(self,w,h)
						local imagePers = buttonAct:Add("DImage")
			            imagePers:SetPos(w/22, h/20)
				        imagePers:SetSize(w-w/10, h-h/10)
				        imagePers:SetImage("materials/stars/haru.png")
			            local imageButton = buttonAct:Add("DImage")
			            imageButton:SetPos(w/20, h/20)
				        imageButton:SetSize(w-w/10, h-h/10)
				        imageButton:SetImage("materials/stars/bluecircle.png")
			        end
			        buttonAct.OnCursorEntered = function() 
						buttonAct:SetAlpha(200)
					end
					buttonAct.OnCursorExited = function()
						buttonAct:SetAlpha(255)
					end
					buttonAct.DoClick = function()
						for i = 1, 13 do
							tableBut[i]:AlphaTo(0,2,0,function() end)
						end
						local imageChar = starsFon:Add("DImage")
						imageChar:SetSize(ScrW()/6,ScrH()/2)
						imageChar:SetPos(ScrW()/2.7,ScrH()/4)
						imageChar:SetImage("materials/stars/haru_big.png")
						imageChar:AlphaTo(0,0,0,function() end)
						imageChar:AlphaTo(255,5,0,function() end)
						sound.PlayFile( "sound/stars/haru.mp3", "", function( channel )
					        channel:Play()
					        channel:SetVolume( 1 )
					        chl = channel
				    	end)
						local buttonYes = starsFon:Add("DLabel")
						buttonYes:SetSize(ScrW()/8,ScrH()/8)
						buttonYes:SetPos(imageChar:GetX()+imageChar:GetWide(),imageChar:GetY()+imageChar:GetTall()/5)
						buttonYes:SetText("Это я!(Enter)")
						buttonYes:AlphaTo(0,0,0,function() end)
						buttonYes:AlphaTo(255,5,0,function() end)
						local buttonNo = starsFon:Add("DLabel")
						buttonNo:SetSize(ScrW()/8,ScrH()/8)
						buttonNo:SetPos(buttonYes:GetX(),buttonYes:GetY()+buttonYes:GetTall())
						buttonNo:SetText("Вообще-то я...(Esc)")
						buttonNo:AlphaTo(0,0,0,function() end)
						buttonNo:AlphaTo(255,5,0,function() end)
					end
			        buttonAct:MoveTo(coordTable[i][1],coordTable[i][2],5,0,-1,function() end)
				end
    		end)
    	end)
	end
end)


local _Fr = nil
hook.Add("PlayerButtonDown", "Avto", function (ply, button)
    if button == 1 and mainWindow == nil then
    	if _Fr ~= nil then 
			_Fr:Remove()
		end
		local NFr = vgui.Create("DFrame")
		_Fr = NFr
		NFr:SetPos(ScrW()*3/8,ScrH()*4/9)
		NFr:MakePopup()
		NFr:SetTitle("Отдать авторитет")
		NFr:SetSize(500,100)
		local STextEntry = vgui.Create("DTextEntry", NFr)
		    STextEntry:SetPlaceholderText("Введите количество авторитета")
		STextEntry:SetPos(5, 50)
		STextEntry:SetSize(490, 20)
		local NButton = vgui.Create("DButton", NFr)
		NButton:SetText("Отправить")
		NButton:SetPos(5, 75)
		NButton:SetSize(490, 20)
		NButton.DoClick = function()
			if tonumber(STextEntry:GetText()) > 0 and tonumber(STextEntry:GetText())<=ply:GetNWFloat("Avtoritet") then
				net.Start("SendAvtoritet")
				net.WriteFloat(STextEntry:GetText())
				net.SendToServer()
				NFr:Remove()
			end
		end
    end
end)