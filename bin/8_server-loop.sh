#!/usr/bin/env bash
cd "$(dirname "$0")"

folder="../docs/tiles"
myip="$(hostname -I | cut -d' ' -f1)"
mainip="168.119.98.135"



echo "check germany.mbtiles"

if [[ ! -f "${folder}/germany.mbtiles" ]]
then
	if [ $myip == $mainip ]
	then
		wget --show-progress "https://storage.googleapis.com/datenhub-net-static/tiles/germany.mbtiles" -O "${folder}/germany.mbtiles"
	else
		wget --show-progress "http://${mainip}:8080/files/germany.mbtiles" -O "${folder}/germany.mbtiles"
	fi
fi



echo "check buffered.tar"

if [ $myip == $mainip ]
then
	if [[ ! -f "${folder}/buffered.tar" ]]
	then
		echo "   buffered.tar is missing. generate one please."
		exit 1
	fi
else
	if [[ ! -f "${folder}/germany.mbtiles" ]]
	then
		wget --show-progress "http://${mainip}:8080/files/buffered.tar" -O "${folder}/buffered.tar"
	else
		filesize1="$(stat --printf='%s' '${folder}/buffered.tar')"
		filesize2="$(curl -sI 'http://${mainip}:8080/files/buffered.tar') | grep -i Content-Length | awk '{print $2}'"
		if [ $filesize1 != $filesize2 ]
		then
			wget --show-progress "http://${mainip}:8080/files/buffered.tar" -O "${folder}/buffered.tar"
		fi
	fi
fi



echo "start server"

while true
do
	git pull
	if [ $myip == $mainip ]
	then
		node 8_server.js main || true
	else
		node 8_server.js node || true
	fi
	echo "restart $(date -Iseconds)"
done
