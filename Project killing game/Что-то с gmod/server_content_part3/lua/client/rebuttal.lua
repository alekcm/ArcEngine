local point = 0
local firstcamera = nil
local secondcamera = nil
local _frame = nil
local leftside = {{},{}}
local rightside = {{},{}}
local CharList
local alive = 0
local supportRebattalTrue = true

net.Receive("ChangeCharList4", function ()
	CharList = net.ReadTable()
	alive = 0
	for i=1,16 do
		if CharList[2][i] == true then
			alive = alive + 1
		end
	end
	end)

	function RotateDrum(object, int)
		if(object:IsValid()) then
		object:SetRotation(object:GetRotation()+int)
		timer.Simple(0.01, function ()
			RotateDrum(object, int)
			end)
		end
	end

	function ChangePoints(int)
		if int ~= 0 then
		if int > 0.25 then
			int = int - 0.25
			point = point - 0.25
			end
			if int < -0.25 then
				int = int + 0.25
			point = point + 0.25
			end
		timer.Simple(0.01, function ()
			ChangePoints(int)
			end)
	end
	end

	function SetAlphaForWiner(line, int)
		if line ~= nil then
		if line:IsValid() then
		if (int > 0 ) then
			if point > 40 then
		line:SetAlpha((point-40)*5)
	else
		line:SetAlpha(0)
	end
	end
	if (int < 0) then
		if point < 40 then
		line:SetAlpha((-point-40)*5)
	else
		line:SetAlpha(0)
	end
end
		timer.Simple(0.01, function ()
				SetAlphaForWiner(line, int)
				end)
	end
	end
end
local localW = 1920.0/ScrW()
local localH = 1080.0/ScrH()
	function AnimateLine(line, int, int2, edge)
		if line ~= nil then
			if line:IsValid() then
					if line:GetY() >= 0 and int2 >=0 then
				line:SetY(edge*localH)
			end 
					if line:GetY() <= edge*localH and int2 <0 then
				line:SetY(0)
			end 
			line:SetPos(ScrW()/2 + ScrW()/200*point + int, line:GetY()+int2)

			timer.Simple(0.02, function ()
				AnimateLine(line, int, int2, edge)
				end)
		end
		end
		end

	local function AnimateStart(blackdown, blackup, back, int)

	local count = int%2
	if(blackdown:IsValid()) then
	blackdown:SetImage("materials/sprites/UI/rebuttalstart/blackdown "..count..".png")
	blackup:SetImage("materials/sprites/UI/rebuttalstart/blackup "..count..".png")
	back:SetImage("materials/sprites/UI/rebuttalstart/back "..count..".png")

	timer.Simple(0.025, function ()
			AnimateStart(blackdown, blackup, back, int+1)
		end)
	end

end

function StartRebuttal()

	net.Start("ChangeCharList3")
			net.SendToServer()

	point = 0
	local frame = vgui.Create( "DFrame" )
	frame:SetSize(ScrW(),ScrH())
	_frame = frame
	frame:MakePopup()
	frame:SetDraggable(false)
	frame:SetKeyboardInputEnabled(false)

	frame.Paint = function (self,w,h)
end

	local frame3 = vgui.Create ("DFrame")
	frame3:SetSize(ScrW(),ScrH())
	frame3:MakePopup()
	frame3:SetKeyboardInputEnabled(false)
	frame3.Paint = function (self,w,h)
	end

	local blackimage = vgui.Create("DImage", frame3)
	blackimage:SetAlpha(0)
	blackimage:SetSize(ScrW(), ScrH())
	blackimage:SetImage("materials/sprites/ui/rebuttalstart/blackscreen.jpg")


	local back = vgui.Create("DImage", frame3)
	back:SetSize(ScrW(), 0)
	back:SetAlpha(0)
	back:SetPos(0, ScrH()/2)
	back:SetImage("materials/sprites/ui/rebuttalstart/back 1.png")

	local blacklineup = vgui.Create("DImage", frame3)
	blacklineup:SetSize(ScrW(), 0)
	blacklineup:SetAlpha(0)
	blacklineup:SetPos(0, ScrH()/2)
	blacklineup:SetImage("materials/sprites/ui/rebuttalstart/blackup 1.png")

	local char1 = vgui.Create("DImage", frame3)
	char1:SetSize(ScrW(), ScrH())
	char1:SetPos(ScrW(), 0)
	char1:SetImage("materials/sprites/ui/rebuttalstart/chars/"..firstcamera:GetNWString("CharacterName")..".png")
	local char2 = vgui.Create("DImage", frame3)
	char2:SetSize(ScrW(), ScrH())
	char2:SetPos(-ScrW(), 0)
	char2:SetImage("materials/sprites/ui/rebuttalstart/chars/"..secondcamera:GetNWString("CharacterName")..".png")
	






		local blacklinedown = vgui.Create("DImage", frame3)
	blacklinedown:SetAlpha(0)
	blacklinedown:SetSize(ScrW(), 0)
	blacklinedown:SetPos(0, ScrH()/2)
	blacklinedown:SetImage("materials/sprites/ui/rebuttalstart/blackdown 1.png")

	AnimateStart(blacklinedown, blacklineup, back, 1)




	local showtime = 0.5

	back:SizeTo(ScrW(), ScrH(), showtime, 0, -1, function ()
		end)
	blacklinedown:SizeTo(ScrW(), ScrH(), showtime, 0, -1, function ()
		end)
	blacklineup:SizeTo(ScrW(), ScrH(), showtime, 0, -1, function ()
		end)
	back:MoveTo(0, 0, showtime, 0, -1, function ()
		end)
	blacklinedown:MoveTo(0, 0, showtime, 0, -1, function ()
		end)
	blacklineup:MoveTo(0, 0, showtime, 0, -1, function ()
		end)
surface.PlaySound("Argue.mp3")
	timer.Simple(showtime, function ()
		surface.PlaySound("Irefuse2.mp3")
	char2:MoveTo(ScrW()/6, 0, 0.2, 0, -1, function ()
		char2:MoveTo(ScrW()/4, 0, 2.5, 0, -1, function ()
		
		end)
		end)
	char1:MoveTo(-ScrW()/6, 0, 0.2, 0, -1, function ()
		char1:MoveTo(-ScrW()/4, 0, 2.5, 0, -1, function ()
		
		end)
		end)
	end)
	back:AlphaTo(255, showtime, 0, function ()
		end)
	blacklinedown:AlphaTo(255, showtime, 0, function ()
		end)
	blacklineup:AlphaTo(255, showtime, 0, function ()
		end)
	timer.Simple(2, function ()
		back:AlphaTo(0, 1, 0, function ()
		end)
		blacklinedown:AlphaTo(0, 1, 0, function ()
		end)
		char1:AlphaTo(0, 1, 0, function ()
		end)
		char2:AlphaTo(0, 1, 0, function ()
		end)
		blacklineup:AlphaTo(0, 1, 0, function ()
			frame3:Remove()
		end)


		end)


	blackimage:AlphaTo(255, 1, 0, function ()
	





	local frame1 = vgui.Create( "DFrame", frame )
frame1:SetSize( ScrW()/2, ScrH())
frame1:SetTitle("")
frame1:ShowCloseButton(false)
frame1:SetDraggable(false)
function frame1:Paint( w, h )

	local x, y = self:GetPos()
	if(firstcamera!=nil) then
	local old = DisableClipping( true )
	render.RenderView( {
		origin = firstcamera:GetPos(),
		angles = firstcamera:GetAngles(),
		aspectratio = 1 + point/100,
		--x = ScrW()/200*point, y = y,
		x = 0, y = y,
		w = ScrW()/2 + ScrW()/200*point, h = ScrH(),
		fov = 60 + point/2
	} )
	DisableClipping( old )
	end
end


            local frame2 = vgui.Create( "DFrame", frame )
frame2:SetSize( ScrW()/2, ScrH())
frame2:SetTitle("")
frame2:ShowCloseButton(false)
frame2:SetDraggable(false)
function frame2:Paint( w, h )

	local x, y = self:GetPos()
if(secondcamera!=nil) then
	local old = DisableClipping( true )
	render.RenderView( {
		origin = secondcamera:GetPos(),
		angles = secondcamera:GetAngles(),
		aspectratio = 1 - point/100,
		x = ScrW()/2 + ScrW()/200*point, y = y,
		--x = ScrW()/2, y = y,
		w = ScrW()/2 - ScrW()/200*point, h = ScrH(),
		fov = 60 - point/2
	} )
	DisableClipping( old )
end
end


local rightwin = vgui.Create("DImage", frame)
rightwin:SetSize(300, ScrH()+100)
rightwin:SetPos(ScrW()/2, 0)
rightwin:SetImage("materials/sprites/ui/rebuttal/rightwin.png")
AnimateLine(rightwin, 0,0, 0)
SetAlphaForWiner(rightwin, -100)

local leftwin = vgui.Create("DImage", frame)
leftwin:SetSize(300, ScrH()+100)
leftwin:SetPos(ScrW()/2, 0)
leftwin:SetImage("materials/sprites/ui/rebuttal/leftwin.png")
AnimateLine(leftwin, -300,0, 0)
SetAlphaForWiner(leftwin, 100)


local leftwintext = vgui.Create("DImage", frame)
leftwintext:SetSize(150, ScrH()+400)
leftwintext:SetPos(ScrW()/2, 0)
leftwintext:SetImage("materials/sprites/ui/rebuttal/leftwintext.png")
AnimateLine(leftwintext, -150,-1, -434)
SetAlphaForWiner(leftwintext, 100)

local righwintext = vgui.Create("DImage", frame)
righwintext:SetSize(150, ScrH()+400)
righwintext:SetPos(ScrW()/2, 0)
righwintext:SetImage("materials/sprites/ui/rebuttal/rightwintext.png")
AnimateLine(righwintext, 0,1, -434)
SetAlphaForWiner(righwintext, -100)


local line = vgui.Create("DImage", frame)
line:SetSize(50, ScrH()+100)
line:SetPos(ScrW()/2 + 16, 0)
line:SetImage("materials/sprites/ui/rebuttal/rightside.png")
AnimateLine(line, 5,-1, -85)
local line2 = vgui.Create("DImage", frame)
line2:SetSize(50, ScrH()+100)
line2:SetPos(ScrW()/2, 0)
line2:SetImage("materials/sprites/ui/rebuttal/leftside.png")
AnimateLine(line2, -55,1, -85)
local whiteline = vgui.Create("DImage", frame)
whiteline:SetSize(48, ScrH())
whiteline:SetPos(ScrW()/2, 0)
whiteline:SetImage("materials/sprites/ui/rebuttal/center.png")
AnimateLine(whiteline, -5,0, 0)

local UI = vgui.Create("DImage", frame)
UI:SetSize(ScrW(), ScrH())
UI:SetImage("materials/sprites/ui/rebuttal/ui.png")

local InnerCircle1 = vgui.Create("DSprite", frame)
InnerCircle1:SetSize(300, 300)
InnerCircle1:SetPos(ScrW()/2, 25)
InnerCircle1:SetMaterial(Material("sprites/ui/rebuttal/drum inner"))
local OuterCircle1 = vgui.Create("DSprite", frame)
OuterCircle1:SetSize(300, 300)
OuterCircle1:SetPos(ScrW()/2, 25)
OuterCircle1:SetMaterial(Material("sprites/ui/rebuttal/drum outer"))
local InnerCircle2 = vgui.Create("DSprite", frame)
InnerCircle2:SetSize(300, 300)
InnerCircle2:SetPos(ScrW()/2, ScrH() - 25)
InnerCircle2:SetMaterial(Material("sprites/ui/rebuttal/drum inner"))
local OuterCircle2 = vgui.Create("DSprite", frame)
OuterCircle2:SetSize(300, 300)
OuterCircle2:SetPos(ScrW()/2, ScrH() - 25)
OuterCircle2:SetMaterial(Material("sprites/ui/rebuttal/drum outer"))

RotateDrum(InnerCircle1, 0.1)
RotateDrum(InnerCircle2, 0.1)
RotateDrum(OuterCircle1, -0.1)
RotateDrum(OuterCircle2, -0.1)

local SpriteFolder = GetSpriteFolder(SpriteFolder)




local button1 = vgui.Create("DButton", frame)
local button2 = vgui.Create("DButton", frame)
button1:SetSize(450,100)
button1:SetPos(0,ScrH()-100)
button2:SetSize(450,100)
button2:SetPos(ScrW()-450,ScrH()-100)

if LocalPlayer():IsSuperAdmin() then
	button1:SetText("Объявить победителем")
	button2:SetText("Объявить победителем")
	button1.DoClick = function()
	net.Start("EndRebuttal")
	net.WriteEntity(firstcamera)
	net.SendToServer()
end
	button2.DoClick = function()
	net.Start("EndRebuttal")
	net.WriteEntity(secondcamera)
	net.SendToServer()
end

else

	
	--button1:SetText("Поддержать")
	--button2:SetText("Поддержать")
	button1.Paint = function (self,w,h)
end
button2.Paint = function (self,w,h)
end
	button1:SetText("")
	button2:SetText("")
	button1.DoClick = function()
		if (supportRebattalTrue == true) then
			net.Start("RebuttalVote")
			local SpriteFolder = GetSpriteFolder(LocalPlayer():Nick())
			net.WriteString(SpriteFolder)
			net.WriteFloat(1)
			net.SendToServer()
			supportRebattalTrue = false
			timer.Simple(7, function()
                supportRebattalTrue = true
            end)
		end
	end
button2.DoClick = function()
	if (supportRebattalTrue == true) then
		net.Start("RebuttalVote")
		local SpriteFolder = GetSpriteFolder(LocalPlayer():Nick())
		net.WriteString(SpriteFolder)
		net.WriteFloat(2)
		net.SendToServer()
		supportRebattalTrue = false
		timer.Simple(7, function()
            supportRebattalTrue = true
        end)
	end
end
	end

if SpriteFolder == firstcamera:GetNWString("CharacterName") or SpriteFolder == secondcamera:GetNWString("CharacterName") then
UI:SetImage("materials/sprites/ui/rebuttal/uiwotext.png")
button1:Remove()
button2:Remove()
	InnerCircle1:SetPos(ScrW()/2, 175)
	OuterCircle1:SetPos(ScrW()/2, 175)
local Panel = vgui.Create('DScrollPanel',frame)
Panel:SetSize(ScrW(),130)
--Panel.Paint = function (self,w,h)
--end
--
local count = 0

for i =0, GetSpriteNumbers(SpriteFolder) do
--if count < CountOfSprites then
local Path ='materials/sprites/'..SpriteFolder..'/'..count..'.png'
local Button = vgui.Create('DButton',Panel)
Panel:AddItem(Button)
Button:SetSize(110,110)
local j = math.Round(((i+1)*125)/ScrW()-0.5)
Button:SetPos(20+i*125-(j*(ScrW()-40)),10+j*125)
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
    local EmotionSmallBoxRownd = vgui.Create("DImage", Button)
    EmotionSmallBoxRownd:SetImage("materials/sprites/UI/trial/EmotionRownd.png")
    EmotionSmallBoxRownd:SetSize(110,110)
    EmotionSmallBoxRownd:SetPos(0,0)
local NumberOfSprite = count
count=count+1
Button.DoClick = function()           
net.Start("ChangeSprite1")
net.WriteFloat(NumberOfSprite)
net.WriteString(SpriteFolder)
net.SendToServer()
end
--end
end
end
frame3:MoveToFront()
	blackimage:AlphaTo(0, 2, 0, function ()
		blackimage:Remove()
		end)
end)
end


net.Receive("RebuttalVote2", function()
local char = net.ReadString()
local number = net.ReadFloat()

local solo = true
if number == 1 then
	for i=1,16 do
		if leftside[1][i] == char then
			leftside[1][i] = nil
			leftside[2][i]:MoveTo(leftside[2][i]:GetX(), ScrH(), 0.1, 0, -1, function ()
			leftside[2][i]:Remove()
			end)
			ChangePoints(-100/(alive-2))
		end
	end
	for i=1,16 do
		if rightside[1][i] == char then
			solo = false
		end
		if solo == true then
		if rightside[1][i] == nil then
			rightside[1][i] = char
			local img = vgui.Create("DImage", _frame)
			if char == "Tsumugi" then
				img:SetImage("materials/sprites/ui/pixelarts/Stumugi.png")
			else
				img:SetImage("materials/sprites/ui/pixelarts/"..char..".png")
			end
			img:SetSize(165,120)
			img:SetPos(math.Rand(400, ScrW()/2-300), ScrH())
			timer.Simple(0.1, function ()
			img:MoveTo(img:GetX(), ScrH()-120, 0.1, 0, -1, function ()
				end)
				sound.PlayFile( "sound/Consern/".. char..".mp3", "", function( channel )
		channel:Play()
		channel:SetVolume( 0.05 )
		
				end)
			end)
			rightside[2][i] = img
			ChangePoints(-100/(alive-2))
			
			solo = false
					end
	end
	end

end

if number == 2 then
	for i=1,16 do
		if rightside[1][i] == char then
			rightside[1][i] = nil
			rightside[2][i]:MoveTo(rightside[2][i]:GetX(), ScrH(), 0.1, 0, -1, function ()
			rightside[2][i]:Remove()
			end)
			ChangePoints(100/(alive-2))
		end
	end

	for i=1,16 do
		if leftside[1][i] == char then
			solo = false
		end
		if solo == true then
		if leftside[1][i] == nil then
			leftside[1][i] = char
			local img = vgui.Create("DImage", _frame)
			if char == "Tsumugi" then
				img:SetImage("materials/sprites/ui/pixelarts/Stumugi.png")
			else
				img:SetImage("materials/sprites/ui/pixelarts/"..char..".png")
			end
			img:SetSize(165,120)
			img:SetPos(ScrW()-math.Rand(400, ScrW()/2-300), ScrH())
			timer.Simple(0.1, function ()
			img:MoveTo(img:GetX(), ScrH()-120, 0.1, 0, -1, function ()
				end)
				sound.PlayFile( "sound/Consern/".. char..".mp3", "", function( channel )
		channel:Play()
		channel:SetVolume( 0.05 )
		
				end)
			end)
			leftside[2][i] = img
			ChangePoints(100/(alive-2))
			
			solo = false
					end
		end
	end

end
	end)


net.Receive("EndRebuttal2", function ()
	local winner = net.ReadEntity()
		print(winner)

	net.Start("StartCameraAnimation")
    local tableCount ={winner:GetNWString("CharacterName"),false,1,1}
	net.WriteTable(tableCount)
	net.SendToServer()



	local frame4 = vgui.Create ("DFrame")
	frame4:SetSize(ScrW(),ScrH())
	frame4:MakePopup()
	frame4:SetKeyboardInputEnabled(false)
	frame4.Paint = function (self,w,h)
	end

	local blackimage = vgui.Create("DImage", frame4)
	blackimage:SetAlpha(0)
	blackimage:SetSize(ScrW(), ScrH())
	blackimage:SetImage("materials/sprites/ui/rebuttalstart/blackscreen.jpg")



local back = vgui.Create("DImage", frame4)
	back:SetSize(ScrW(), 0)
	back:SetAlpha(0)
	back:SetPos(0, ScrH()/2)
	back:SetImage("materials/sprites/ui/rebuttalstart/back 1.png")

	local blacklineup = vgui.Create("DImage", frame4)
	blacklineup:SetSize(ScrW(), 0)
	blacklineup:SetAlpha(0)
	blacklineup:SetPos(0, ScrH()/2)
	blacklineup:SetImage("materials/sprites/ui/rebuttalstart/blackup 1.png")

	local char1 = vgui.Create("DImage", frame4)
	char1:SetSize(ScrW(), ScrH())
	if winner == firstcamera then
	char1:SetPos(-ScrW(), 0)
elseif winner == secondcamera then
	char1:SetPos(ScrW(), 0)
end
	char1:SetImage("materials/sprites/ui/rebuttalstart/chars/"..winner:GetNWString("CharacterName")..".png")
	

		local blacklinedown = vgui.Create("DImage", frame4)
	blacklinedown:SetAlpha(0)
	blacklinedown:SetSize(ScrW(), 0)
	blacklinedown:SetPos(0, ScrH()/2)
	blacklinedown:SetImage("materials/sprites/ui/rebuttalstart/blackdown 1.png")

	AnimateStart(blacklinedown, blacklineup, back, 1)




	local showtime = 0.5

	back:SizeTo(ScrW(), ScrH(), showtime, 0, -1, function ()
		end)
	blacklinedown:SizeTo(ScrW(), ScrH(), showtime, 0, -1, function ()
		end)
	blacklineup:SizeTo(ScrW(), ScrH(), showtime, 0, -1, function ()
		end)
	back:MoveTo(0, 0, showtime, 0, -1, function ()
		end)
	blacklinedown:MoveTo(0, 0, showtime, 0, -1, function ()
		end)
	blacklineup:MoveTo(0, 0, showtime, 0, -1, function ()
		end)
surface.PlaySound("Argue.mp3")
	timer.Simple(showtime, function ()
		surface.PlaySound("Argue3.mp3")


if winner == firstcamera then
	char1:MoveTo(-ScrW()/20, 0, 0.2, 0, -1, function ()
		char1:MoveTo(ScrW()/20, 0, 2.5, 0, -1, function ()
		end)
		end)
elseif winner == secondcamera then
	char1:MoveTo(ScrW()/20, 0, 0.2, 0, -1, function ()
		char1:MoveTo(-ScrW()/20, 0, 2.5, 0, -1, function ()
		end)
		end)
end


		end)
		
	
	back:AlphaTo(255, showtime, 0, function ()
		end)
	blacklinedown:AlphaTo(255, showtime, 0, function ()
		end)
	blacklineup:AlphaTo(255, showtime, 0, function ()
		end)
	timer.Simple(2, function ()
		back:AlphaTo(0, 1, 0, function ()
		end)
		blacklinedown:AlphaTo(0, 1, 0, function ()
		end)
		char1:AlphaTo(0, 1, 0, function ()
		end)
		blacklineup:AlphaTo(0, 1, 0, function ()
			frame4:Remove()
		end)


		end)







	blackimage:AlphaTo(255, 1, 0, function ()

	_frame:Remove() 

		firstcamera = nil
	secondcamera = nil
	leftside = {{},{}}
	rightside = {{},{}}
	
	blackimage:AlphaTo(0, 2, 0, function ()
			blackimage:Remove()
			frame4:Remove()
			end)
	end)
		end)

local single1 = true

net.Receive("GetFirstCamera", function ()
	firstcamera = net.ReadEntity()
	if secondcamera ~= nil and single1 == true then
		single1 = false
		StartRebuttal()
		timer.Simple(1, function ()
			single1 = true
			end)
	end
	end)
net.Receive("GetSecondCamera", function()
	secondcamera = net.ReadEntity()
	if firstcamera ~= nil and single1 == true then
		single1 = false
		StartRebuttal()
		timer.Simple(1, function ()
			single1 = true
			end)
	end
	end)

function GetSpriteNumbers(Name)
	local	PlayerName = LocalPlayer():Nick()
	local CountOfSprites
if PlayerName == "Макото Наеги" or PlayerName == "Макото Наэги" then 
	Name = "Makoto"
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
		elseif (PlayerName == "Изуру Камакура") then 
		Name = "Hajime"
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
        elseif PlayerName == "Мускулкума" then 
		Name = "monokuma"
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
        elseif (PlayerName == "Сасухиро Хагакуро") then 
		Name = "Yasuhiro"
	--[[	elseif PlayerName == "Сара Чидоин" then 
		Name = "Sara"
		CountOfSprites = 20
				elseif PlayerName == "Джо Тазуна" then 
		Name = "Joe"
		CountOfSprites = 16
				elseif PlayerName == "Кейджи Шиноги" then 
		Name = "Keiji"
		CountOfSprites = 18
				elseif PlayerName == "Канна Кизучи" then 
		Name = "Kanna"
		CountOfSprites = 28
				elseif PlayerName == "Кьютаро Бургерберг" then 
		Name = "Q-taro"
		CountOfSprites = 19
				elseif PlayerName == "Шин Тсукими" then 
		Name = "Shin"
		CountOfSprites = 37
				elseif PlayerName == "Реко Ябусаме" then 
		Name = "Reko"
		CountOfSprites = 26
				elseif PlayerName == "Нао Эгокоро" then 
		Name = "Nao"
		CountOfSprites = 21
				elseif PlayerName == "Кай Сато" then 
		Name = "Kai"
		CountOfSprites = 12
		elseif PlayerName == "Гин Ибуши" then 
		Name = "Gin"
		CountOfSprites = 18
		elseif PlayerName == "Рио Рейнджер" then 
		Name = "Rio"
		CountOfSprites = 4
		elseif PlayerName == "Соу Хиёри" then 
		Name = "Sou"
		CountOfSprites = 9
		elseif PlayerName == "Ранмару Кагеяма" then 
		Name = "Ranmaru"
		CountOfSprites = 23
		elseif PlayerName == "Май Тсуруги" then 
		Name = "Mai"
		CountOfSprites = 15]]
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
		Name = "Marinm"
		elseif PlayerName == "Ёкокуме Мару" or PlayerName == "Йококуме Мару" then 
		Name = "Maru"
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
        elseif PlayerName == "Хранитель знаний" then 
		Name = "Loremaster"
        elseif PlayerName == "Монофокс" or PlayerName == "Китсу" then 
		Name = "Monofox"
		elseif PlayerName == "Рёко Отонаши" then 
		Name = "Ryoko"
        
        elseif PlayerName == "Рю" then 
		Name = "Makoto"
        elseif PlayerName == "Эстер Юги" then 
		Name = "Chiaki"
        elseif PlayerName == "Хомяк" then 
		Name = "Hajime"
        elseif PlayerName == "Елисеев Николай" then 
		Name = "HAjime"
        elseif PlayerName == "Азами" then 
		Name = "Leon"
        elseif PlayerName == "Киоко" then 
		Name = "Sonia"
        elseif PlayerName == "Такуми Отонаши" then 
		Name = "Rantaro"
        elseif PlayerName == "Карен Шиода" then 
		Name = "Shuichi"
        elseif PlayerName == "Коптева Варвара" then 
		Name = "Himiko"
        elseif PlayerName == "Дмитрий Простофилев" then 
		Name = "Korekiyo"
        elseif PlayerName == "Катана" then 
		Name = "Nagito"
        elseif PlayerName == "Джонни Спинс" then 
		Name = "Kazuichi"
        elseif PlayerName == "Письмо" then 
		Name = "HImiko"
         elseif PlayerName == "Хару Юги" then 
		Name = "Ibuki"
         elseif PlayerName == "Борис Бурылов" then 
		Name = "Boris"
         elseif PlayerName == "Зеро" then 
		Name = "SHuichi"    
        elseif PlayerName == "Анимешка" then 
		Name = "Hifumi"
        elseif PlayerName == "Кохэку Сано" then 
		Name = "Joe"
        elseif PlayerName == "Даики Ниномаэ" then 
		Name = "Kai"
        elseif PlayerName == "Нори Уэмура" then 
		Name = "Sora"
        elseif PlayerName == "Сэйери Тамура" then 
		Name = "Seyeri"
        elseif PlayerName == "Маэми Киносита" then 
		Name = "Maemi"
        elseif PlayerName == "Масахиро Гото" then 
		Name = "Masahiro"
        elseif PlayerName == "Кику Ёсида" then 
		Name = "Kiku" 
        elseif PlayerName == "Чиеко Хирата" then 
		Name = "Chieko"
        elseif PlayerName == "Юкайо Танигути" then 
		Name = "Yukayo" 
        elseif PlayerName == "Мамору Нисида" then 
		Name = "Mamoru"
        elseif PlayerName == "Кадзуми Ивамото" then 
		Name = "Kadzumi"
        elseif PlayerName == "Харуми Фудзивара" then 
		Name = "Harumi"
        elseif PlayerName == "Марико Ватанабэ" then 
		Name = "Mariko"
        elseif PlayerName == "Акено Минами" then 
		Name = "Akeno"
        elseif PlayerName == "Такудзи Отонаши" then 
		Name = "Takudzi"
        elseif PlayerName == "Микаса Сайонджи" then 
		Name = "Mikasa"
        elseif PlayerName == "Каору Амаги" then 
		Name = "Kaoru"
        elseif PlayerName == "Медако Макасубе" then 
		Name = "Medako"
        elseif PlayerName == "Реймондас Деметис" then 
		Name = "Reimondas"
        elseif PlayerName == "Наруки Исаму" then 
		Name = "Naruki"
        elseif PlayerName == "Юки Окумура" then 
		Name = "Kokichi"
        elseif PlayerName == "Хидеки Кимура" then 
		Name = "Hajime"
        elseif PlayerName == "Аято Юи" then 
		Name = "Ayato"
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
        elseif PlayerName == "KAngel" then 
		Name = "Kangel"
        elseif PlayerName == "Арэй Нагейши" then 
		Name = "Arei"
        elseif PlayerName == "Вероника Гребенщикова" then 
		Name = "Veronika"
        elseif PlayerName == "Мин Чжун" then 
		Name = "Min"
        elseif PlayerName == "Амэ" then 
		Name = "Ame"
        
			else  Name = "Table"
				CountOfSprites = 0
			end
    		local listSprites = file.Find("materials/"..Name.."/*.png","WORKSHOP")
			CountOfSprites = #listSprites
    		if(CountOfSprites == 0) then
        	listSprites = file.Find("materials/"..Name.."/*.vtf","WORKSHOP")
        	CountOfSprites = #listSprites
        	end
			return CountOfSprites-1
end
print("Rebuttal saved")